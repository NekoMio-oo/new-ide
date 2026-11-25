package main

import (
	"os"
	"path/filepath"
	"testing"
)

// TestShippedRootfsExtracts runs the real bundled Alpine tarball through the
// extractor that ships on device, so we know the archive + symlinks are sane.
func TestShippedRootfsExtracts(t *testing.T) {

	for _, abi := range []string{"arm64-v8a", "x86_64"} {
		t.Run(abi, func(t *testing.T) { testRootfsArchive(t, abi) })
	}

}

func testRootfsArchive(t *testing.T, abi string) {
	archive, err := filepath.Abs(filepath.Join("..", "apps", "mobile-ide", "android",
		"app", "src", "main", "assets", "rootfs", "alpine-"+abi+".tgz"))
	if err != nil {
		t.Fatal(err)
	}
	if _, statErr := os.Stat(archive); statErr != nil {
		t.Skipf("bundled rootfs not present: %v", statErr)
	}

	dest := t.TempDir()
	if err := extractRootfsArchive(archive, dest); err != nil {
		t.Fatalf("extract: %v", err)
	}

	sh := filepath.Join(dest, "bin", "sh")
	link, err := os.Readlink(sh)
	if err != nil {
		t.Fatalf("/bin/sh is not a symlink: %v", err)
	}
	if link != "/bin/busybox" {
		t.Errorf("/bin/sh -> %q, want /bin/busybox", link)
	}
	for _, rel := range []string{"bin/busybox", "etc/alpine-release", "sbin/apk", "etc/ssl/certs/ca-certificates.crt"} {
		if _, statErr := os.Stat(filepath.Join(dest, rel)); statErr != nil {
			t.Errorf("missing %s: %v", rel, statErr)
		}
	}
	release, _ := os.ReadFile(filepath.Join(dest, "etc", "alpine-release"))
	t.Logf("bundled rootfs reports Alpine %s", release)
}
