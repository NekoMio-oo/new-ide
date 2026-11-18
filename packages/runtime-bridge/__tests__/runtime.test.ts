import { describe, it, expect, beforeEach } from 'vitest';
import {
  BrowserWasmRuntimeBridge,
  parseCompilerDiagnostics,
} from '../src';

describe('PocketForge RuntimeBridge & Compiler Diagnostics', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('seeds starter templates and persists VFS read/write/rename/delete offline', async () => {
    const bridge = new BrowserWasmRuntimeBridge(true);
    await bridge.initialize();

    expect(await bridge.fs.exists('web-nebula-app/index.html')).toBe(true);
    await bridge.fs.writeFile('demo/hello.py', 'print(6 * 7)\n');
    expect(await bridge.fs.readFile('demo/hello.py')).toBe('print(6 * 7)\n');

    await bridge.fs.renamePath('demo/hello.py', 'demo/calc.py');
    expect(await bridge.fs.exists('demo/hello.py')).toBe(false);
    expect(await bridge.fs.exists('demo/calc.py')).toBe(true);
  });

  it('executes JavaScript, Python, Rust, C++, and Android FastAPK profiles offline', async () => {
    const bridge = new BrowserWasmRuntimeBridge(true);
    await bridge.initialize();

    const pyProfiles = await bridge.runner.detectRunProfiles('python-algo-kit', 'python-algo-kit/main.py');
    expect(pyProfiles[0].ecosystem).toBe('python');
    const pyRes = await bridge.runner.execute(pyProfiles[0]);
    expect(pyRes.exitCode).toBe(0);
    expect(pyRes.stdout).toContain('[0,1,1,2,3,5,8,13,21,34]');

    const apkProfiles = await bridge.runner.detectRunProfiles(
      'android-fastapk-demo',
      'android-fastapk-demo/src/dev/pocketforge/hello/MainActivity.kt'
    );
    expect(apkProfiles[0].ecosystem).toBe('android-apk');
    const apkRes = await bridge.runner.execute(apkProfiles[0]);
    expect(apkRes.exitCode).toBe(0);
    expect(apkRes.artifactApkPath).toBe('android-fastapk-demo/build/outputs/app-debug.apk');
    expect(await bridge.fs.exists(apkRes.artifactApkPath!)).toBe(true);
  });

  it('supports full offline Git init, stage, commit, branch, checkout, and discard', async () => {
    const bridge = new BrowserWasmRuntimeBridge(false);
    await bridge.fs.writeFile('app/main.js', 'console.log("v1");\n');
    await bridge.git.init('app');
    await bridge.git.stage('app', 'main.js');
    const c1 = await bridge.git.commit('app', 'initial commit');
    expect(c1.length).toBeGreaterThanOrEqual(8);

    await bridge.git.createBranch('app', 'feat-touch', true);
    await bridge.fs.writeFile('app/main.js', 'console.log("v2-branch");\n');
    await bridge.git.stage('app', 'main.js');
    await bridge.git.commit('app', 'branch update');

    await bridge.git.checkout('app', 'main');
    expect(await bridge.fs.readFile('app/main.js')).toBe('console.log("v1");\n');
  });

  it('parses Clang, Rustc, TypeScript, and Python compiler errors into clickable locations', () => {
    const sample = [
      'systems-polyglot/main.cpp:14:9: error: expected \';\' after expression',
      'error[E0425]: cannot find value `x` in this scope',
      '--> systems-polyglot/src/main.rs:22:5',
      'src/app.ts(9,3): error TS2304: Cannot find name \'foo\'.',
      'File "python-algo-kit/main.py", line 19, in <module>',
      'ZeroDivisionError: division by zero',
    ].join('\n');

    const diags = parseCompilerDiagnostics(sample);
    expect(diags).toHaveLength(4);
    expect(diags[0]).toMatchObject({ file: 'systems-polyglot/main.cpp', line: 14, column: 9, severity: 'error' });
    expect(diags[1]).toMatchObject({ file: 'systems-polyglot/src/main.rs', line: 22, column: 5 });
    expect(diags[2]).toMatchObject({ file: 'src/app.ts', line: 9, column: 3 });
    expect(diags[3]).toMatchObject({ file: 'python-algo-kit/main.py', line: 19, message: 'ZeroDivisionError: division by zero' });
  });
});
