# PocketForge IDE — 手机多功能离线开发环境

融合 **跨平台混合工作台（React 19 + TypeScript + CodeMirror 6 + Capacitor）** 与 **Android 原生重度编译内核（Kotlin + Go 本地 Linux 守护进程 + 模块化离线工具链包）** 的全功能手机 IDE。

## 核心特性

1. **专业触控代码编辑器 (`@pocketforge/editor-engine`)**
   - 基于 CodeMirror 6 定制，支持 JS/TS、HTML/CSS、Python、C/C++、Rust、Go、Java/Kotlin、SQL、Markdown 等多语言离线高亮与 AST 大纲符号跳转。
   - **双层可定制扩展符号栏**：防软键盘收起 (`preventDefault`)、成对括号自动包裹、语法树语义级一键「扩选 / 缩选」、**滑动控光标虚拟触控板**。
2. **真 PTY 终端与多语言一键运行器 (`@pocketforge/terminal-runner` + `native-daemon`)**
   - 前端 `xterm.js` + 触控终端快捷键条；Android 模式下通过本地守护进程挂载 `/dev/ptmx` 真伪终端，Web/PWA 模式下提供离线虚拟 POSIX Shell 与内置 JS/TS/Python 执行器。
   - 自动解析 Clang / Rustc / Go / Python / TypeScript 编译报错行号，支持点击直接跳回编辑器报错位置。
3. **Web 实时预览与移动端内置 DevTools (`@pocketforge/preview-devtools`)**
   - 支持编辑器上下分屏热更新预览与多视口切换，内置 Console 实时求值 REPL、DOM 节点检查、Network 抓包瀑布流与 Storage 查看器。
4. **离线 Git 可视化与触控单列 Diff (`@pocketforge/git-workbench`)**
   - 支持离线初始化仓库、暂存/回滚、提交历史、分支切换合并、单列触控 Unified Diff 与三段式合并冲突一键解决器。
5. **开发者瑞士军刀工具箱 (`@pocketforge/dev-toolbox`)**
   - **Mini-Postman** 本地接口调试台、**SQLite Wasm** 可视化数据库查询与导出、**JSON/YAML/正则/JWT/Base64** 实验室、**Markdown + KaTeX** 笔记预览、**离线 `.tar.zst` 工具链包管理器**。
6. **轻量多厂商 API AI 随身编程助手 (`@pocketforge/ai-copilot`)**
   - 支持接入 DeepSeek / OpenAI 兼容 / Gemini / Claude 自定义 Base URL 与 API Key（流式 SSE 输出），提供代码选区悬浮胶囊、终端红字一键诊断修复及单列内联 Diff 一键采纳。

## 快速运行与构建指令

```bash
# 1. 启动开发服务器（支持手机同一局域网浏览器或桌面模拟器即时调试）
npm run dev

# 2. 运行全量单元测试与组件集成测试
npm test

# 3. 构建分包优化后的离线前端资源并同步至 Capacitor Android 宿主
npm run build
npm run sync:android

# 4. 交叉编译 Android 本地守护进程 (生成 arm64-v8a 与 x86_64 SELinux 可执行 libide_daemon.so)
npm run build:daemon

# 5. 运行 Go 守护进程真 PTY 与安全解压单元测试
go test -C native-daemon -v ./...

# 6. 打包离线工具链镜像包 (.tar.zst / .tar.gz + SHA-256 清单)
python3 scripts/toolchain-packer/pack_toolchain.py --pack-id pack-cc --create-sample --output-dir ./dist-packs
```
