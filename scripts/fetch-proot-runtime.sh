#!/bin/sh
# Downloads and stages the proot runtime that ships inside the APK.
#
# Two things are needed on device:
#   1. proot itself, plus libtalloc/libandroid-shmem. Android only extracts and
#      makes executable the entries under jniLibs/<abi>/lib*.so, so proot is
#      renamed libproot.so. Termux's build links against libtalloc.so.2, a name
#      AGP will not package, so the SONAME reference is rewritten in place to
#      libtalloc.so (same length prefix, NUL padded) — no LD_PRELOAD tricks.
#   2. An Alpine minirootfs tarball per ABI, extracted by the daemon on first
#      launch into filesDir/container/alpine.
#
# Sources: Termux packages via the NJU mirror, Alpine via the Aliyun mirror.
# Re-run with FORCE=1 to refresh the checked-in binaries.
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
JNI_DIR="$ROOT_DIR/apps/mobile-ide/android/app/src/main/jniLibs"
ASSET_DIR="$ROOT_DIR/apps/mobile-ide/android/app/src/main/assets/rootfs"

TERMUX_MIRROR="${TERMUX_MIRROR:-https://mirror.nju.edu.cn/termux/apt/termux-main}"
ALPINE_MIRROR="${ALPINE_MIRROR:-https://mirrors.aliyun.com/alpine}"
ALPINE_VER="${ALPINE_VER:-v3.20}"
ALPINE_REL="${ALPINE_REL:-3.20.3}"

PROOT_DEB="proot_5.1.107.102"
TALLOC_DEB="libtalloc_2.5.0"
SHMEM_DEB="libandroid-shmem_0.7"

WORK_DIR="${TMPDIR:-/tmp}/pocketforge-proot-stage"
mkdir -p "$WORK_DIR"

fetch() {
	url="$1"
	out="$2"
	if [ -f "$out" ] && [ "${FORCE:-0}" != "1" ]; then
		return 0
	fi
	echo "  fetch $(basename "$out")"
	curl -fsSL --max-time 180 -o "$out" "$url"
}

# extract_data_tar <deb> <destdir>
extract_data_tar() {
	python3 - "$1" "$2" <<'PY'
import io, lzma, os, sys, tarfile, bz2, gzip

deb, dest = sys.argv[1], sys.argv[2]
with open(deb, 'rb') as f:
    if f.read(8) != b'!<arch>\n':
        sys.exit('not a deb: ' + deb)
    while True:
        hdr = f.read(60)
        if len(hdr) < 60:
            break
        name = hdr[:16].decode().strip().rstrip('/')
        size = int(hdr[48:58].decode().strip())
        data = f.read(size)
        if f.tell() % 2:
            f.read(1)
        if not name.startswith('data.tar'):
            continue
        if name.endswith('.xz'):
            data = lzma.decompress(data)
        elif name.endswith('.gz'):
            data = gzip.decompress(data)
        elif name.endswith('.bz2'):
            data = bz2.decompress(data)
        os.makedirs(dest, exist_ok=True)
        with tarfile.open(fileobj=io.BytesIO(data)) as tar:
            tar.extractall(dest, filter='fully_trusted')
        break
PY
}

# patch_needed <elf> <old> <new>
patch_needed() {
	python3 - "$1" "$2" "$3" <<'PY'
import sys
path, old, new = sys.argv[1], sys.argv[2], sys.argv[3]
blob = open(path, 'rb').read()
needle = old.encode() + b'\x00'
if needle not in blob:
    sys.exit('reference %r not found in %s' % (old, path))
replacement = new.encode() + b'\x00' * (len(needle) - len(new))
patched = blob.replace(needle, replacement, 1)
open(path, 'wb').write(patched)
print('  patched %s: %s -> %s' % (path.split('/')[-1], old, new))
PY
}

stage_abi() {
	abi="$1"          # arm64-v8a | x86_64
	termux_arch="$2"  # aarch64 | x86_64
	alpine_arch="$3"  # aarch64 | x86_64

	echo "[$abi] proot runtime"
	base="$WORK_DIR/$abi"
	mkdir -p "$base"
	fetch "$TERMUX_MIRROR/pool/main/p/proot/${PROOT_DEB}_${termux_arch}.deb" "$base/proot.deb"
	fetch "$TERMUX_MIRROR/pool/main/libt/libtalloc/${TALLOC_DEB}_${termux_arch}.deb" "$base/talloc.deb"
	fetch "$TERMUX_MIRROR/pool/main/liba/libandroid-shmem/${SHMEM_DEB}_${termux_arch}.deb" "$base/shmem.deb"

	rm -rf "$base/x"
	extract_data_tar "$base/proot.deb" "$base/x"
	extract_data_tar "$base/talloc.deb" "$base/x"
	extract_data_tar "$base/shmem.deb" "$base/x"

	termux_usr="$base/x/data/data/com.termux/files/usr"
	mkdir -p "$JNI_DIR/$abi"
	cp "$termux_usr/bin/proot" "$JNI_DIR/$abi/libproot.so"
	cp "$termux_usr/lib/libtalloc.so.2" "$JNI_DIR/$abi/libtalloc.so"
	cp "$termux_usr/lib/libandroid-shmem.so" "$JNI_DIR/$abi/libandroid-shmem.so"
	chmod 0755 "$JNI_DIR/$abi/libproot.so" "$JNI_DIR/$abi/libtalloc.so" "$JNI_DIR/$abi/libandroid-shmem.so"
	patch_needed "$JNI_DIR/$abi/libproot.so" "libtalloc.so.2" "libtalloc.so"

	echo "[$abi] alpine minirootfs"
	mkdir -p "$ASSET_DIR"
	tarball="$ASSET_DIR/alpine-$abi.tgz"
	fetch "$ALPINE_MIRROR/$ALPINE_VER/releases/$alpine_arch/alpine-minirootfs-$ALPINE_REL-$alpine_arch.tar.gz" "$tarball"
}

stage_abi arm64-v8a aarch64 aarch64
stage_abi x86_64 x86_64 x86_64

echo
echo "Staged:"
ls -lh "$JNI_DIR"/arm64-v8a/libproot.so "$JNI_DIR"/x86_64/libproot.so
ls -lh "$ASSET_DIR"/*.tar.gz
