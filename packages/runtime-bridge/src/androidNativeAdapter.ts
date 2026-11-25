import { registerPlugin } from '@capacitor/core';
import { BrowserWasmRuntimeBridge } from './browserAdapter';
import { parseCompilerDiagnostics } from './errorParser';
import type {
  FileNode,
  PTYProvider,
  PTYSessionInfo,
  RunProfile,
  RunResult,
  RunnerProvider,
  RuntimeBridge,
} from './types';

export interface PocketForgeCapacitorPlugin {
  startDaemon(): Promise<{ port: number; rootfsPath: string; status: string }>;
  getDaemonStatus(): Promise<{ running: boolean; port: number; pid: number }>;
  installApk(options: { apkPath: string }): Promise<{ launched: boolean; message: string }>;
  setForegroundBuildActive(options: { active: boolean; title?: string }): Promise<void>;
}

export const PocketForgeNative = registerPlugin<PocketForgeCapacitorPlugin>('PocketForgeNative');

const DEFAULT_DAEMON_ORIGIN = 'http://127.0.0.1:19527';

/** What the workspace sheet shows under 运行环境. */
export interface ContainerRuntimeStatus {
  mode: 'proot' | 'device';
  ready: boolean;
  alpineVersion?: string;
  nodeVersion?: string;
  detail?: string;
  guestWork?: string;
}

/** Files bigger than this are not worth mirroring into the container. */
const MAX_SYNC_FILE_BYTES = 2 * 1024 * 1024;

const BINARY_EXT = /\.(png|jpe?g|gif|webp|ico|bmp|woff2?|ttf|otf|eot|wasm|zip|gz|tgz|zst|xz|apk|aar|jar|so|dylib|pdf|mp4|mp3)$/i;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

class DaemonPTYProvider implements PTYProvider {
  private sockets = new Map<string, WebSocket>();
  private listeners = new Map<string, Set<(chunk: string) => void>>();

  constructor(
    private daemonOrigin: string,
    private beforeCreate?: () => Promise<void>
  ) {}

  async createSession(cwd = '', cols = 80, rows = 24): Promise<PTYSessionInfo> {
    // The editor keeps files in the WebView VFS; mirror them first so `ls`
    // inside the Alpine container shows the project the user is looking at.
    await this.beforeCreate?.().catch(() => {});
    const res = await fetch(`${this.daemonOrigin}/api/pty`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cwd, cols, rows }),
    });
    if (!res.ok) throw new Error(`Failed to create native PTY: ${res.status}`);
    const info = (await res.json()) as PTYSessionInfo;

    const wsUrl = this.daemonOrigin.replace(/^http/, 'ws') + `/ws/pty?id=${encodeURIComponent(info.id)}`;
    const ws = new WebSocket(wsUrl);
    const subs = new Set<(chunk: string) => void>();
    this.listeners.set(info.id, subs);
    ws.onmessage = (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : '';
      for (const cb of subs) cb(text);
    };
    this.sockets.set(info.id, ws);
    return info;
  }

  async writeInput(sessionId: string, data: string): Promise<void> {
    const ws = this.sockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  async resize(sessionId: string, cols: number, rows: number): Promise<void> {
    const ws = this.sockets.get(sessionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }

  async killSession(sessionId: string): Promise<void> {
    const ws = this.sockets.get(sessionId);
    ws?.close();
    this.sockets.delete(sessionId);
    this.listeners.delete(sessionId);
    await fetch(`${this.daemonOrigin}/api/pty?id=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    }).catch(() => {});
  }

  onData(sessionId: string, callback: (chunk: string) => void): () => void {
    let subs = this.listeners.get(sessionId);
    if (!subs) {
      subs = new Set();
      this.listeners.set(sessionId, subs);
    }
    subs.add(callback);
    return () => subs?.delete(callback);
  }
}

/**
 * Android Native Linux Sandbox Bridge:
 * Connects to the local Go `native-daemon` (running inside Android PRoot / Linux Rootfs)
 * for real PTY shells, native compilers (clang/rustc/go/kotlinc/aapt2), and ForegroundService
 * Phantom Process Killer protection, while delegating offline VFS caching seamlessly.
 */
export class AndroidNativeRuntimeBridge implements RuntimeBridge {
  readonly mode = 'android-native' as const;
  private fallback = new BrowserWasmRuntimeBridge(true);
  private daemonOrigin = DEFAULT_DAEMON_ORIGIN;
  private daemonPty: DaemonPTYProvider;
  private runnerImpl: RunnerProvider;
  private lastSyncAt = 0;
  private containerStatus: ContainerRuntimeStatus | null = null;

  constructor(daemonOrigin = DEFAULT_DAEMON_ORIGIN) {
    this.daemonOrigin = daemonOrigin;
    this.daemonPty = new DaemonPTYProvider(daemonOrigin, () => this.syncWorkspace());
    // Build the runner delegate ONCE. Returning a fresh object from a getter
    // broke React consumers that key useCallback/useEffect deps on
    // `bridge.runner` (e.g. PocketWorkbench loadActiveFile): every render got
    // a new identity, the effect re-fired, setState produced a new array ->
    // infinite re-render loop that froze the whole UI in native mode.
    this.runnerImpl = {
      detectRunProfiles: (projectRoot: string, activeFile: string | null) =>
        this.fallback.runner.detectRunProfiles(projectRoot, activeFile),
      execute: async (
        profile: RunProfile,
        onStream?: (chunk: string, stream: 'stdout' | 'stderr') => void
      ): Promise<RunResult> => {
        await PocketForgeNative.setForegroundBuildActive({
          active: true,
          title: `正在编译运行: ${profile.label}`,
        }).catch(() => {});

        // The container can only execute files that exist on disk.
        await this.syncWorkspace(true).catch(() => {});

        try {
          const res = await fetch(`${this.daemonOrigin}/api/exec`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              command: profile.command,
              cwd: profile.cwd,
              env: {
                MAKEFLAGS: '-j2',
                CARGO_BUILD_JOBS: '2',
              },
            }),
          });
          if (!res.ok) {
            return this.fallback.runner.execute(profile, onStream);
          }
          const payload = (await res.json()) as {
            exitCode: number;
            stdout: string;
            stderr: string;
            durationMs: number;
            artifactApkPath?: string;
          };
          if (payload.stdout) onStream?.(payload.stdout.replace(/\n/g, '\r\n'), 'stdout');
          if (payload.stderr) onStream?.(payload.stderr.replace(/\n/g, '\r\n'), 'stderr');
          return {
            ...payload,
            diagnostics: parseCompilerDiagnostics(`${payload.stderr}\n${payload.stdout}`),
          };
        } finally {
          await PocketForgeNative.setForegroundBuildActive({ active: false }).catch(() => {});
        }
      },
    };
  }

  get fs() {
    return this.fallback.fs;
  }

  get git() {
    return this.fallback.git;
  }

  get toolchains() {
    return this.fallback.toolchains;
  }

  get pty(): PTYProvider {
    return this.daemonPty;
  }

  get runner(): RunnerProvider {
    return this.runnerImpl;
  }

  async initialize(): Promise<void> {
    await this.fallback.initialize();
    try {
      const info = await PocketForgeNative.startDaemon();
      if (info.port) {
        this.daemonOrigin = `http://127.0.0.1:${info.port}`;
        this.daemonPty = new DaemonPTYProvider(this.daemonOrigin, () => this.syncWorkspace());
      }
    } catch {
      // Daemon already started externally on 127.0.0.1:19527
    }
    await this.getContainerStatus().catch(() => null);
  }

  /** Actual proot/Alpine state, used by the workspace sheet. */
  async getContainerStatus(force = false): Promise<ContainerRuntimeStatus | null> {
    if (this.containerStatus && !force) return this.containerStatus;
    try {
      const res = await fetch(`${this.daemonOrigin}/api/container`);
      if (!res.ok) return this.containerStatus;
      const raw = (await res.json()) as {
        mode?: string;
        ready?: boolean;
        alpineVersion?: string;
        nodeVersion?: string;
        detail?: string;
        guestWork?: string;
      };
      this.containerStatus = {
        mode: raw.mode === 'proot' ? 'proot' : 'device',
        ready: Boolean(raw.ready),
        alpineVersion: raw.alpineVersion,
        nodeVersion: raw.nodeVersion,
        detail: raw.detail,
        guestWork: raw.guestWork,
      };
      return this.containerStatus;
    } catch {
      return this.containerStatus;
    }
  }

  /**
   * Mirrors the WebView VFS into the daemon workspace so the Alpine container
   * (and a real `node`/`python3`) can see the project. Throttled because it
   * runs before every shell session and every run.
   */
  async syncWorkspace(force = false): Promise<void> {
    const now = Date.now();
    if (!force && now - this.lastSyncAt < 1500) return;

    const dirs: string[] = [];
    const files: Array<{ path: string; content: string; base64?: boolean }> = [];

    const walk = async (nodes: FileNode[]): Promise<void> => {
      for (const node of nodes) {
        if (node.kind === 'directory') {
          dirs.push(node.path);
          await walk(node.children ?? []);
          continue;
        }
        try {
          if (BINARY_EXT.test(node.path)) {
            if (node.size > MAX_SYNC_FILE_BYTES) continue;
            const bytes = await this.fallback.fs.readBinaryFile(node.path);
            files.push({ path: node.path, content: toBase64(bytes), base64: true });
          } else {
            const text = await this.fallback.fs.readFile(node.path);
            if (text.length > MAX_SYNC_FILE_BYTES) continue;
            files.push({ path: node.path, content: text });
          }
        } catch {
          // Unreadable entries are skipped rather than failing the whole sync.
        }
      }
    };

    try {
      await walk(await this.fallback.fs.listTree());
      const res = await fetch(`${this.daemonOrigin}/api/fs/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dirs, files }),
      });
      if (res.ok) this.lastSyncAt = now;
    } catch {
      // Daemon not reachable yet (still booting) — the next call retries.
    }
  }

  async requestInstallApk(apkPath: string): Promise<{ launched: boolean; message: string }> {
    try {
      return await PocketForgeNative.installApk({ apkPath });
    } catch (err) {
      return {
        launched: false,
        message: `调起 Android 安装器失败: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

export async function createAutoRuntimeBridge(): Promise<RuntimeBridge> {
  // Probe native daemon or Capacitor Android platform
  const isCapacitorAndroid =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());

  if (isCapacitorAndroid) {
    const bridge = new AndroidNativeRuntimeBridge();
    await bridge.initialize();
    return bridge;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 250);
    const probe = await fetch(`${DEFAULT_DAEMON_ORIGIN}/api/health`, { signal: controller.signal });
    clearTimeout(timer);
    if (probe.ok) {
      const bridge = new AndroidNativeRuntimeBridge(DEFAULT_DAEMON_ORIGIN);
      await bridge.initialize();
      return bridge;
    }
  } catch {
    // Fallback to pure offline Browser/Wasm sandbox
  }

  const webBridge = new BrowserWasmRuntimeBridge(true);
  await webBridge.initialize();
  return webBridge;
}
