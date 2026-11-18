export type RuntimeMode = 'android-native' | 'browser-wasm';

export interface FileNode {
  path: string;
  name: string;
  kind: 'file' | 'directory';
  size: number;
  updatedAt: number;
  children?: FileNode[];
}

export interface FSProvider {
  listTree(rootPath?: string): Promise<FileNode[]>;
  readFile(path: string): Promise<string>;
  readBinaryFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string): Promise<void>;
  writeBinaryFile(path: string, data: Uint8Array): Promise<void>;
  mkdir(path: string): Promise<void>;
  deletePath(path: string): Promise<void>;
  renamePath(oldPath: string, newPath: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  onChange(listener: (changedPath: string) => void): () => void;
}

export interface PTYSessionInfo {
  id: string;
  title: string;
  cwd: string;
  cols: number;
  rows: number;
}

export interface PTYProvider {
  createSession(cwd?: string, cols?: number, rows?: number): Promise<PTYSessionInfo>;
  writeInput(sessionId: string, data: string): Promise<void>;
  resize(sessionId: string, cols: number, rows: number): Promise<void>;
  killSession(sessionId: string): Promise<void>;
  onData(sessionId: string, callback: (chunk: string) => void): () => void;
}

export interface DiagnosticLocation {
  file: string;
  line: number;
  column: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  rawLine: string;
}

export type LanguageEcosystem =
  | 'web'
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'cpp'
  | 'c'
  | 'rust'
  | 'go'
  | 'java'
  | 'kotlin'
  | 'android-apk'
  | 'shell';

export interface RunProfile {
  id: string;
  label: string;
  ecosystem: LanguageEcosystem;
  command: string;
  entryFile: string;
  cwd: string;
  supportsLivePreview?: boolean;
}

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  diagnostics: DiagnosticLocation[];
  artifactApkPath?: string;
}

export interface RunnerProvider {
  detectRunProfiles(projectRoot: string, activeFile: string | null): Promise<RunProfile[]>;
  execute(
    profile: RunProfile,
    onStream?: (chunk: string, stream: 'stdout' | 'stderr') => void
  ): Promise<RunResult>;
}

export type GitFileState = 'modified' | 'added' | 'deleted' | 'untracked';

export interface GitStatusItem {
  filepath: string;
  state: GitFileState;
  staged: boolean;
}

export interface GitCommitInfo {
  oid: string;
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: number;
}

export interface GitProvider {
  init(dir: string): Promise<void>;
  isRepo(dir: string): Promise<boolean>;
  status(dir: string): Promise<GitStatusItem[]>;
  stage(dir: string, filepath: string): Promise<void>;
  unstage(dir: string, filepath: string): Promise<void>;
  discardFile(dir: string, filepath: string): Promise<void>;
  commit(dir: string, message: string, author?: { name: string; email: string }): Promise<string>;
  log(dir: string, depth?: number): Promise<GitCommitInfo[]>;
  listBranches(dir: string): Promise<{ current: string; branches: string[] }>;
  createBranch(dir: string, branchName: string, checkout?: boolean): Promise<void>;
  checkout(dir: string, branchName: string): Promise<void>;
  getFileAtHead(dir: string, filepath: string): Promise<string>;
}

export type ToolchainPackId =
  | 'core'
  | 'pack-web'
  | 'pack-python'
  | 'pack-cc'
  | 'pack-go-rust'
  | 'pack-android';

export interface ToolchainPackInfo {
  id: ToolchainPackId;
  name: string;
  version: string;
  sizeMB: number;
  installed: boolean;
  bundled?: boolean;
  description: string;
  binaries: string[];
  lspServers: string[];
  sha256?: string;
}

export interface ToolchainManager {
  listPacks(): Promise<ToolchainPackInfo[]>;
  importOfflinePack(fileName: string, archiveBytes: Uint8Array): Promise<ToolchainPackInfo>;
  markPackInstalled(packId: ToolchainPackId): Promise<void>;
  removePack(packId: ToolchainPackId): Promise<void>;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  category: 'Web 全栈' | 'Python' | 'C/C++ & Rust/Go' | 'Android APK';
  description: string;
  defaultEntry: string;
  files: Record<string, string>;
}

export interface RuntimeBridge {
  readonly mode: RuntimeMode;
  readonly fs: FSProvider;
  readonly pty: PTYProvider;
  readonly runner: RunnerProvider;
  readonly git: GitProvider;
  readonly toolchains: ToolchainManager;
  initialize(): Promise<void>;
  requestInstallApk(apkPath: string): Promise<{ launched: boolean; message: string }>;
}
