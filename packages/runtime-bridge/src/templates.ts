import type { ProjectTemplate, ToolchainPackInfo } from './types';

export const BUILTIN_TOOLCHAIN_PACKS: ToolchainPackInfo[] = [
  {
    id: 'core',
    name: 'PocketForge Core 离线底座',
    version: '1.0.0',
    sizeMB: 92,
    installed: true,
    bundled: true,
    description: '内置 POSIX Shell、Git、Web 实时预览服务器、SQLite Wasm 与全语言语法分析树',
    binaries: ['sh', 'git', 'quickjs', 'sqlite3'],
    lspServers: ['lezer-ast-outline'],
  },
  {
    id: 'pack-web',
    name: 'Web 全栈工具链包 (pack-web)',
    version: '22.14.0-arm64',
    sizeMB: 75,
    installed: true,
    description: 'Node.js LTS、esbuild 极速打包器与 TypeScript/HTML/CSS 智能语言服务',
    binaries: ['node', 'npm', 'esbuild'],
    lspServers: ['typescript-language-server', 'vscode-html-language-server'],
  },
  {
    id: 'pack-python',
    name: 'Python 3.12 科学计算包 (pack-python)',
    version: '3.12.8-arm64',
    sizeMB: 65,
    installed: true,
    description: 'CPython 3.12 解释器、离线 Wheel 安装器与 Ruff/Pyright 静态检查服务',
    binaries: ['python3', 'pip'],
    lspServers: ['ruff-lsp', 'pyright-langserver'],
  },
  {
    id: 'pack-cc',
    name: 'LLVM / Clang C&C++ 系统编译包 (pack-cc)',
    version: '19.1.5-arm64',
    sizeMB: 180,
    installed: false,
    description: 'Clang/Clang++、LLD 链接器、CMake/Ninja、LLDB 调试器与 clangd 补全服务',
    binaries: ['clang', 'clang++', 'lld', 'cmake', 'ninja', 'lldb'],
    lspServers: ['clangd'],
  },
  {
    id: 'pack-go-rust',
    name: 'Go & Rust 编译工具链包 (pack-go-rust)',
    version: '1.24-1.85-arm64',
    sizeMB: 320,
    installed: false,
    description: 'Go 1.24 编译器、Rustc/Cargo (支持离线 Vendor 源) 与 gopls / rust-analyzer',
    binaries: ['go', 'gofmt', 'rustc', 'cargo'],
    lspServers: ['gopls', 'rust-analyzer'],
  },
  {
    id: 'pack-android',
    name: 'Java/Kotlin & FastAPK 手机自举构建包 (pack-android)',
    version: '35.0.2-arm64',
    sizeMB: 280,
    installed: false,
    description: 'OpenJDK 21、kotlinc、ARM64 原生 aapt2 / d8 / apksigner，支持手机离线 5 秒生成 APK',
    binaries: ['javac', 'kotlinc', 'aapt2', 'd8', 'apksigner', 'fastapk'],
    lspServers: ['kotlin-language-server', 'jdtls'],
  },
];

export const STARTER_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'web-nebula-app',
    name: '星云交互看板 (Web 全栈实时预览)',
    category: 'Web 全栈',
    description: '包含 HTML5 + CSS3 + 模块化 JS，演示分屏实时预览、Console 日志拦截与本地接口调试。',
    defaultEntry: 'web-nebula-app/app.js',
    files: {
      'web-nebula-app/index.html': `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>星云任务看板</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <main class="card">
    <header class="header">
      <span class="badge">PocketForge Live</span>
      <h1>星云移动端实时预览</h1>
      <p>修改代码即可在上方或分屏视窗实时热更新，点击按钮可在移动端 DevTools 查看日志与网络请求。</p>
    </header>
    <section class="stats" id="stats-grid">
      <div class="stat-item">
        <span class="label">完成进度</span>
        <strong id="counter">86%</strong>
      </div>
      <div class="stat-item">
        <span class="label">本地延迟</span>
        <strong>1.4 ms</strong>
      </div>
    </section>
    <div class="actions">
      <button id="boost-btn" type="button">触发性能优化 (+2%)</button>
      <button id="ping-btn" class="secondary" type="button">模拟接口请求</button>
    </div>
    <ul id="log-list" class="log-list"></ul>
  </main>
  <script src="./app.js"></script>
</body>
</html>
`,
      'web-nebula-app/styles.css': `* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: radial-gradient(circle at top, #1e293b, #0f172a);
  color: #f8fafc;
  min-height: 100vh;
  padding: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.card {
  width: 100%;
  max-width: 420px;
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  padding: 22px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
}
.badge {
  display: inline-block;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.18);
  color: #38bdf8;
  margin-bottom: 10px;
}
h1 { font-size: 20px; margin-bottom: 8px; }
p { font-size: 13px; color: #94a3b8; line-height: 1.5; }
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 18px 0;
}
.stat-item {
  background: rgba(15, 23, 42, 0.7);
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.12);
}
.stat-item .label { display: block; font-size: 11px; color: #94a3b8; }
.stat-item strong { font-size: 22px; color: #38bdf8; }
.actions { display: flex; gap: 10px; }
button {
  flex: 1;
  border: none;
  border-radius: 10px;
  padding: 11px 14px;
  font-weight: 600;
  font-size: 13px;
  cursor: pointer;
  background: #0ea5e9;
  color: white;
}
button.secondary { background: #334155; color: #e2e8f0; }
.log-list { margin-top: 14px; list-style: none; font-size: 12px; color: #cbd5e1; }
.log-list li { padding: 6px 0; border-bottom: 1px solid rgba(148, 163, 184, 0.1); }
`,
      'web-nebula-app/app.js': `let score = 86;

function appendLog(text) {
  console.log('[NebulaApp]', text);
  const ul = document.getElementById('log-list');
  if (!ul) return;
  const li = document.createElement('li');
  li.textContent = new Date().toLocaleTimeString() + ' - ' + text;
  ul.prepend(li);
}

const boostBtn = document.getElementById('boost-btn');
const pingBtn = document.getElementById('ping-btn');
const counterEl = document.getElementById('counter');

if (boostBtn && counterEl) {
  boostBtn.addEventListener('click', () => {
    score = Math.min(100, score + 2);
    counterEl.textContent = score + '%';
    appendLog('性能评分已提升至 ' + score + '%');
  });
}

if (pingBtn) {
  pingBtn.addEventListener('click', async () => {
    appendLog('正在发起健康检查请求...');
    try {
      const res = await fetch('data:application/json,' + encodeURIComponent(JSON.stringify({ ok: true, latencyMs: 1.4 })));
      const data = await res.json();
      console.info('[NetworkMock] 响应结果:', data);
      appendLog('健康检查成功: ok=' + data.ok);
    } catch (err) {
      console.error('[NetworkMock] 请求失败:', err);
    }
  });
}

appendLog('Web 实时预览已就绪');
`,
      'web-nebula-app/README.md': `# 星云交互看板 (PocketForge 示例工程)

## 功能体验指南
1. 打开 \`app.js\` 或 \`styles.css\`，点击顶栏 **预览** 开启上下分屏实时渲染。
2. 在预览区点击按钮，展开内置 **DevTools** 查看 Console 输出与 Network 请求记录。
3. 打开 **Git** 面板查看单列触控 Diff 并提交版本。
`,
    },
  },
  {
    id: 'python-algo-kit',
    name: 'Python 算法与数据工坊',
    category: 'Python',
    description: '离线运行 Python 脚本，演示快速排序、斐波那契动态规划与数据统计输出。',
    defaultEntry: 'python-algo-kit/main.py',
    files: {
      'python-algo-kit/main.py': `# PocketForge Python 离线运行示例
def fib_sequence(n):
    seq = []
    a = 0
    b = 1
    for i in range(n):
        seq.append(a)
        nxt = a + b
        a = b
        b = nxt
    return seq

def summarize_scores(scores):
    total = sum(scores)
    avg = total / len(scores)
    best = max(scores)
    return {"count": len(scores), "sum": total, "avg": round(avg, 2), "max": best}

nums = fib_sequence(10)
print("前 10 项斐波那契数列:", nums)

report = summarize_scores([92, 88, 95, 100, 84, 91])
print("离线测评统计结果:", report)
`,
    },
  },
  {
    id: 'systems-polyglot',
    name: 'C++ & Rust 高性能系统工程',
    category: 'C/C++ & Rust/Go',
    description: '包含 C++20 与 Rust Cargo 工程模板，支持本地 Linux 容器编译与报错行点击定位。',
    defaultEntry: 'systems-polyglot/src/main.rs',
    files: {
      'systems-polyglot/Cargo.toml': `[package]
name = "pocket_bench"
version = "0.1.0"
edition = "2021"

[dependencies]
`,
      'systems-polyglot/src/main.rs': `fn fast_pow(mut base: i64, mut exp: u32) -> i64 {
    let mut result = 1;
    while exp > 0 {
        if exp & 1 == 1 {
            result *= base;
        }
        base *= base;
        exp >>= 1;
    }
    result
}

fn main() {
    let val = fast_pow(3, 10);
    println!("PocketForge Rust 离线计算 3^10 = {}", val);
}
`,
      'systems-polyglot/main.cpp': `#include <iostream>
#include <vector>
#include <numeric>

int main() {
    std::vector<int> values = {10, 20, 30, 40, 50};
    int sum = std::accumulate(values.begin(), values.end(), 0);
    std::cout << "PocketForge C++20 离线求和: " << sum << std::endl;
    return 0;
}
`,
    },
  },
  {
    id: 'android-fastapk-demo',
    name: 'Android 手机自举应用 (FastAPK)',
    category: 'Android APK',
    description: '轻量 Kotlin Android 应用模板，配合 pack-android 离线 5 秒编译生成签名 APK 并调起系统安装。',
    defaultEntry: 'android-fastapk-demo/src/dev/pocketforge/hello/MainActivity.kt',
    files: {
      'android-fastapk-demo/fastapk.json': `{
  "appName": "HelloPocketAPK",
  "applicationId": "dev.pocketforge.hello",
  "minSdk": 26,
  "targetSdk": 35,
  "versionCode": 1,
  "versionName": "1.0.0"
}
`,
      'android-fastapk-demo/AndroidManifest.xml': `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="dev.pocketforge.hello">
    <application
        android:label="HelloPocketAPK"
        android:allowBackup="true">
        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`,
      'android-fastapk-demo/src/dev/pocketforge/hello/MainActivity.kt': `package dev.pocketforge.hello

import android.app.Activity
import android.os.Bundle
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val label = TextView(this).apply {
            text = "由手机端 PocketForge IDE 离线自举编译生成！"
            textSize = 20f
            setPadding(48, 96, 48, 48)
        }
        setContentView(label)
    }
}
`,
    },
  },
];
