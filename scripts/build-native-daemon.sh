#!/bin/sh
set -eu

GO_BIN="${GO_BIN:-go}"
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
DAEMON_DIR="$ROOT_DIR/native-daemon"
JNI_DIR="$ROOT_DIR/apps/mobile-ide/android/app/src/main/jniLibs"

mkdir -p "$JNI_DIR/arm64-v8a" "$JNI_DIR/x86_64"

echo "[1/2] Cross-compiling libide_daemon.so for Android arm64-v8a..."
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 "$GO_BIN" build -C "$DAEMON_DIR" -trimpath -ldflags="-s -w" \
  -o "$JNI_DIR/arm64-v8a/libide_daemon.so" .

echo "[2/2] Compiling libide_daemon.so for Android Emulator x86_64..."
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 "$GO_BIN" build -C "$DAEMON_DIR" -trimpath -ldflags="-s -w" \
  -o "$JNI_DIR/x86_64/libide_daemon.so" .

chmod 0755 "$JNI_DIR/arm64-v8a/libide_daemon.so" "$JNI_DIR/x86_64/libide_daemon.so"
echo "Done! Generated SELinux-ready JNI native binaries:"
ls -lh "$JNI_DIR/arm64-v8a/libide_daemon.so" "$JNI_DIR/x86_64/libide_daemon.so"
