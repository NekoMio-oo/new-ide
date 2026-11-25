package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// makeRootfsArchive builds a miniature rootfs tarball: a directory, a regular
// file, an absolute symlink (the /bin/sh -> /bin/busybox pattern) and a
// traversal attempt that must be rejected.
func makeRootfsArchive(t *testing.T, path string, includeTraversal bool) {
	t.Helper()
	buf := new(bytes.Buffer)
	gz := gzip.NewWriter(buf)
	tw := tar.NewWriter(gz)

	add := func(hdr *tar.Header, body string) {
		hdr.Size = int64(len(body))
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write header: %v", err)
		}
		if _, err := tw.Write([]byte(body)); err != nil {
			t.Fatalf("write body: %v", err)
		}
	}

	if err := tw.WriteHeader(&tar.Header{Name: "bin/", Typeflag: tar.TypeDir, Mode: 0o755}); err != nil {
		t.Fatal(err)
	}
	add(&tar.Header{Name: "bin/busybox", Typeflag: tar.TypeReg, Mode: 0o755}, "#!/bin/sh\n")
	if err := tw.WriteHeader(&tar.Header{
		Name: "bin/sh", Typeflag: tar.TypeSymlink, Linkname: "/bin/busybox", Mode: 0o777,
	}); err != nil {
		t.Fatal(err)
	}
	add(&tar.Header{Name: "etc/alpine-release", Typeflag: tar.TypeReg, Mode: 0o644}, "3.20.3\n")
	if includeTraversal {
		add(&tar.Header{Name: "../escape.txt", Typeflag: tar.TypeReg, Mode: 0o644}, "nope")
	}

	if err := tw.Close(); err != nil {
		t.Fatal(err)
	}
	if err := gz.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buf.Bytes(), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestExtractRootfsKeepsSymlinksAndRejectsTraversal(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "alpine.tar.gz")
	makeRootfsArchive(t, archive, true)

	dest := filepath.Join(dir, "rootfs")
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	err := extractRootfsArchive(archive, dest)
	if err == nil {
		t.Fatal("expected traversal entry to be rejected")
	}
	// Entries before the bad one must already be in place, links included.
	link := filepath.Join(dest, "bin", "sh")
	target, readErr := os.Readlink(link)
	if readErr != nil {
		t.Fatalf("symlink missing: %v", readErr)
	}
	if target != "/bin/busybox" {
		t.Fatalf("symlink target = %q, want /bin/busybox", target)
	}
	if _, statErr := os.Stat(filepath.Join(dest, "bin", "busybox")); statErr != nil {
		t.Fatalf("busybox missing: %v", statErr)
	}
}

func TestEnsureRootfsWritesConfigAndMarker(t *testing.T) {
	dir := t.TempDir()
	archive := filepath.Join(dir, "alpine.tar.gz")
	makeRootfsArchive(t, archive, false)

	rootfs := filepath.Join(dir, "container", "alpine")
	proot := filepath.Join(dir, "libproot.so")
	if err := os.WriteFile(proot, []byte("stub"), 0o755); err != nil {
		t.Fatal(err)
	}

	c := &ContainerConfig{
		RootfsDir:   rootfs,
		ProotPath:   proot,
		ArchivePath: archive,
		Workspace:   filepath.Join(dir, "workspace"),
	}
	if c.Ready() {
		t.Fatal("container must not be ready before extraction")
	}
	if err := c.EnsureRootfs(); err != nil {
		t.Fatalf("EnsureRootfs: %v", err)
	}
	if !c.Ready() {
		t.Fatal("container should be ready after extraction")
	}

	for _, rel := range []string{"etc/resolv.conf", "etc/apk/repositories", rootfsMarker} {
		if _, err := os.Stat(filepath.Join(rootfs, rel)); err != nil {
			t.Errorf("missing %s: %v", rel, err)
		}
	}
	repos, err := os.ReadFile(filepath.Join(rootfs, "etc", "apk", "repositories"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(repos), "alpine") {
		t.Errorf("apk repositories not configured: %q", repos)
	}

	// Absolute symlinks are rewritten relative to the rootfs: the kernel would
	// otherwise resolve /bin/busybox against the host root and fail with
	// `execve("/bin/sh"): No such file or directory` under proot.
	link, err := os.Readlink(filepath.Join(rootfs, "bin", "sh"))
	if err != nil {
		t.Fatalf("readlink /bin/sh: %v", err)
	}
	if link != "busybox" {
		t.Errorf("/bin/sh -> %q, want the relative target busybox", link)
	}
	if _, err := os.Stat(filepath.Join(rootfs, "bin", "sh")); err != nil {
		t.Errorf("/bin/sh does not resolve after normalisation: %v", err)
	}

	// Second call must be a no-op rather than re-extracting.
	if err := c.EnsureRootfs(); err != nil {
		t.Fatalf("second EnsureRootfs: %v", err)
	}
	if again, _ := os.Readlink(filepath.Join(rootfs, "bin", "sh")); again != "busybox" {
		t.Errorf("normalisation is not idempotent: %q", again)
	}
}

func TestContainerArgvAndGuestPath(t *testing.T) {
	c := &ContainerConfig{
		RootfsDir: "/data/app/files/container/alpine",
		ProotPath: "/data/app/lib/libproot.so",
		LibDir:    "/data/app/lib",
		Workspace: "/data/app/files/workspace",
		GuestWork: "/workspace",
	}

	got := strings.Join(c.ExecArgv("/data/app/files/workspace/web-nebula-app", "node app.js"), " ")
	for _, want := range []string{
		"-r /data/app/files/container/alpine",
		"-0",
		"-w /workspace/web-nebula-app",
		"-b /data/app/files/workspace:/workspace",
		"/bin/sh -lc node app.js",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("argv missing %q\nfull: %s", want, got)
		}
	}

	if p := c.GuestPath("/data/app/files/workspace/a/b.js"); p != "/workspace/a/b.js" {
		t.Errorf("GuestPath = %q", p)
	}
	if p := c.GuestPath("/etc/passwd"); p != "/workspace" {
		t.Errorf("paths outside the workspace must clamp to the mount root, got %q", p)
	}

	shell := strings.Join(c.ShellArgv("/data/app/files/workspace"), " ")
	if !strings.HasSuffix(shell, "/bin/sh -l") {
		t.Errorf("shell argv should end with a login shell: %s", shell)
	}

	env := strings.Join(c.Env(), " ")
	if !strings.Contains(env, "LD_LIBRARY_PATH=/data/app/lib") {
		t.Errorf("LD_LIBRARY_PATH missing from env: %s", env)
	}
	if !strings.Contains(env, "PROOT_NO_SECCOMP=1") {
		t.Errorf("PROOT_NO_SECCOMP missing from env: %s", env)
	}
}

func TestContainerStatusFallsBackToDeviceShell(t *testing.T) {
	disabled := &ContainerConfig{Disabled: true, RootfsDir: "/nope", ProotPath: "/nope"}
	if st := disabled.Status(); st.Mode != "device" || st.Ready {
		t.Errorf("disabled container status = %+v", st)
	}
	if st := (*ContainerConfig)(nil).Status(); st.Mode != "device" {
		t.Errorf("nil container status = %+v", st)
	}
}

func TestBootstrapAndTokenParsing(t *testing.T) {
	cases := map[string]string{
		"node app.js":                   "apk add --no-cache nodejs",
		"python3 main.py":               "apk add --no-cache python3",
		"cargo run":                     "apk add --no-cache cargo",
		"echo hi":                       "",
		"FOO=1 GIT_DIR=.git git status": "apk add --no-cache git",
	}
	for cmd, want := range cases {
		if got := bootstrapCommand(firstCommandToken(cmd)); got != want {
			t.Errorf("bootstrapCommand(firstCommandToken(%q)) = %q, want %q", cmd, got, want)
		}
	}
	if got := firstCommandToken("/usr/bin/node app.js"); got != "node" {
		t.Errorf("absolute path token = %q", got)
	}
}
