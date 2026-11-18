# PocketForge IDE

类似androidide的全功能手机 IDE。

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
