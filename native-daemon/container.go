package main

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// ContainerConfig describes the proot-backed Alpine userland that replaces
// the bare Android /system/bin shell. Everything here is optional: when
// proot or the rootfs is missing, callers fall back to the device shell.
type ContainerConfig struct {
	// RootfsDir is the extracted Alpine tree (…/files/container/alpine).
	RootfsDir string
	// ProotPath is the executable shipped as libproot.so in nativeLibraryDir.
	ProotPath string
	// LibDir holds libtalloc.so / libandroid-shmem.so next to proot.
	LibDir string
	// ArchivePath is the bundled minirootfs tarball (assets copied by the host).
	ArchivePath string
	// Workspace is the host directory exposed to the guest at GuestWork.
	Workspace string
	// GuestWork is the in-container mount point for Workspace.
	GuestWork string
	// Disabled forces the plain device shell even when the container is ready.
	Disabled bool
	// shellErr caches the result of the startup self-check ("" means healthy).
	shellErr string
}

const (
	rootfsMarker     = ".pocketforge-rootfs"
	defaultGuestWork = "/workspace"
	alpineMirror     = "https://mirrors.aliyun.com/alpine/v3.20"
)

func (c *ContainerConfig) guestWork() string {
	if c == nil || c.GuestWork == "" {
		return defaultGuestWork
	}
	return c.GuestWork
}

// Ready reports whether proot plus a provisioned rootfs are both usable.
func (c *ContainerConfig) Ready() bool {
	if c == nil || c.Disabled || c.ProotPath == "" || c.RootfsDir == "" {
		return false
	}
	if !fileExists(c.ProotPath) || !fileExists(filepath.Join(c.RootfsDir, rootfsMarker)) {
		return false
	}
	// Busybox is the only thing every Alpine rootfs must have.
	return fileExists(filepath.Join(c.RootfsDir, "bin", "busybox"))
}

// EnsureRootfs extracts the bundled minirootfs once and writes the small
// amount of configuration Alpine needs to be useful on Android (DNS, apk
// mirror, shell profile). Safe to call on every start: extraction no-ops once
// the marker exists, while the symlink normalisation below always runs.
func (c *ContainerConfig) EnsureRootfs() error {
	if c == nil || c.Disabled || c.RootfsDir == "" {
		return fmt.Errorf("container disabled")
	}
	if !fileExists(filepath.Join(c.RootfsDir, rootfsMarker)) {
		if c.ArchivePath == "" || !fileExists(c.ArchivePath) {
			return fmt.Errorf("rootfs archive not found: %q", c.ArchivePath)
		}
		if err := os.MkdirAll(c.RootfsDir, 0o755); err != nil {
			return err
		}
		if err := extractRootfsArchive(c.ArchivePath, c.RootfsDir); err != nil {
			return fmt.Errorf("extract rootfs: %w", err)
		}
		c.writeRootfsConfig()
		if err := os.WriteFile(filepath.Join(c.RootfsDir, rootfsMarker), []byte("alpine\n"), 0o644); err != nil {
			return err
		}
	}
	// Always normalise, so installs provisioned by older builds get repaired
	// without re-extracting (or re-downloading) the whole rootfs.
	return c.fixAbsoluteSymlinks()
}

// fixAbsoluteSymlinks rewrites absolute symlink targets inside the rootfs to
// relative ones.
//
// The kernel resolves a symlink target during execve/open, outside of proot's
// syscall interception, so `/bin/sh -> /bin/busybox` would be looked up in the
// *host* root. On Android that path does not exist and every shell dies with
// `proot error: execve("/bin/sh"): No such file or directory`. Alpine's
// minirootfs ships 310 such links, which is why proroot-based installers run
// the same rewrite step after unpacking.
func (c *ContainerConfig) fixAbsoluteSymlinks() error {
	if !fileExists(c.RootfsDir) {
		return nil
	}
	absRoot, err := filepath.Abs(c.RootfsDir)
	if err != nil {
		return err
	}
	return filepath.WalkDir(absRoot, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil || d.Type()&os.ModeSymlink == 0 {
			return nil
		}
		target, readErr := os.Readlink(path)
		if readErr != nil || !strings.HasPrefix(target, "/") {
			return nil
		}
		rel, relErr := filepath.Rel(filepath.Dir(path), filepath.Join(absRoot, target))
		if relErr != nil || rel == "" {
			return nil
		}
		// Replacing the link is not atomic, but a crash mid-way only leaves a
		// missing link, and the next start rewrites it again.
		if err := os.Remove(path); err != nil {
			return nil
		}
		_ = os.Symlink(rel, path)
		return nil
	})
}

func (c *ContainerConfig) writeRootfsConfig() {
	// Android apps cannot read netd's resolver, so pin public resolvers.
	_ = os.MkdirAll(filepath.Join(c.RootfsDir, "etc"), 0o755)
	_ = os.WriteFile(filepath.Join(c.RootfsDir, "etc", "resolv.conf"),
		[]byte("nameserver 223.5.5.5\nnameserver 1.1.1.1\n"), 0o644)
	_ = os.MkdirAll(filepath.Join(c.RootfsDir, "etc", "apk"), 0o755)
	_ = os.WriteFile(filepath.Join(c.RootfsDir, "etc", "apk", "repositories"),
		[]byte(alpineMirror+"/main\n"+alpineMirror+"/community\n"), 0o644)

	// busybox ash has no bash-style \[ \] escapes, so keep the prompt plain
	// instead of leaking escape sequences into the terminal.
	profile := `export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export HOME=/root
export LANG=C.UTF-8
export PS1='\u@alpine:\w\$ '
cd /workspace 2>/dev/null || cd /root
`
	_ = os.MkdirAll(filepath.Join(c.RootfsDir, "etc", "profile.d"), 0o755)
	_ = os.WriteFile(filepath.Join(c.RootfsDir, "etc", "profile.d", "pocketforge.sh"),
		[]byte(profile), 0o644)
	_ = os.MkdirAll(filepath.Join(c.RootfsDir, "root"), 0o755)
	_ = os.WriteFile(filepath.Join(c.RootfsDir, "root", ".profile"), []byte(profile), 0o644)
	_ = os.MkdirAll(filepath.Join(c.RootfsDir, "workspace"), 0o755)
	_ = os.MkdirAll(filepath.Join(c.RootfsDir, "tmp"), 0o1777)
}

// extractRootfsArchive unpacks a minirootfs tarball with symlink support.
// The generic pack extractor deliberately drops links, which would leave
// /bin/sh pointing nowhere; a rootfs needs them intact.
func extractRootfsArchive(archivePath, destRoot string) error {
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()

	var reader io.Reader = f
	if strings.HasSuffix(strings.ToLower(archivePath), ".gz") || strings.HasSuffix(strings.ToLower(archivePath), ".tgz") {
		gz, gzErr := gzip.NewReader(f)
		if gzErr != nil {
			return gzErr
		}
		defer gz.Close()
		reader = gz
	}

	absRoot, err := filepath.Abs(destRoot)
	if err != nil {
		return err
	}
	tr := tar.NewReader(reader)
	for {
		hdr, nextErr := tr.Next()
		if nextErr == io.EOF {
			return nil
		}
		if nextErr != nil {
			return nextErr
		}
		// Tarballs start with "./" for the root directory itself; skip it
		// instead of treating it as an empty (and therefore unsafe) name.
		if rel := strings.TrimPrefix(hdr.Name, "./"); rel == "" || rel == "." {
			continue
		}
		target, pathErr := safeJoin(absRoot, hdr.Name)
		if pathErr != nil {
			return pathErr
		}

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			mode := os.FileMode(hdr.Mode) & 0o777
			if mode == 0 {
				mode = 0o644
			}
			out, openErr := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if openErr != nil {
				return openErr
			}
			if _, copyErr := io.Copy(out, tr); copyErr != nil {
				_ = out.Close()
				return copyErr
			}
			_ = out.Close()
		case tar.TypeSymlink:
			// Absolute links are normal inside a rootfs (/bin/sh -> /bin/busybox);
			// they are only dangerous when they escape the tree, which safeJoin
			// already rejects for the entry itself.
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			_ = os.Remove(target)
			if err := os.Symlink(hdr.Linkname, target); err != nil {
				return err
			}
		case tar.TypeLink:
			linkTarget, linkErr := safeJoin(absRoot, hdr.Linkname)
			if linkErr != nil {
				return linkErr
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			_ = os.Remove(target)
			if err := os.Link(linkTarget, target); err != nil {
				// Hard links can fail on some filesystems; copying is not worth
				// the complexity for a handful of busybox applets.
				continue
			}
		}
	}
}

func safeJoin(absRoot, name string) (string, error) {
	clean := filepath.Clean(strings.TrimPrefix(name, "./"))
	if clean == "." || clean == "" {
		return "", fmt.Errorf("empty archive entry")
	}
	if filepath.IsAbs(clean) || strings.HasPrefix(clean, "..") {
		return "", fmt.Errorf("unsafe archive entry: %q", name)
	}
	target := filepath.Join(absRoot, clean)
	if target != absRoot && !strings.HasPrefix(target, absRoot+string(os.PathSeparator)) {
		return "", fmt.Errorf("archive entry escapes root: %q", name)
	}
	return target, nil
}

// GuestPath maps a host path under Workspace onto the guest mount point.
func (c *ContainerConfig) GuestPath(hostPath string) string {
	work := c.guestWork()
	if c == nil || c.Workspace == "" || hostPath == "" {
		return work
	}
	rel, err := filepath.Rel(c.Workspace, hostPath)
	if err != nil || strings.HasPrefix(rel, "..") {
		return work
	}
	if rel == "." {
		return work
	}
	return work + "/" + filepath.ToSlash(rel)
}

// prootArgv builds the full command line: proot flags, then the guest program.
func (c *ContainerConfig) prootArgv(hostCwd string, guestArgv []string) []string {
	args := []string{
		"-r", c.RootfsDir,
		"-0", // pretend to be root so apk and package scripts behave
		"-w", c.GuestPath(hostCwd),
		"-b", "/dev",
		"-b", "/proc",
		"-b", "/sys",
		"--kill-on-exit",
	}
	if c.Workspace != "" {
		args = append(args, "-b", c.Workspace+":"+c.guestWork())
	}
	return append(args, guestArgv...)
}

// ShellArgv is the login shell used for interactive PTY sessions.
func (c *ContainerConfig) ShellArgv(hostCwd string) []string {
	return c.prootArgv(hostCwd, []string{"/bin/sh", "-l"})
}

// ExecArgv wraps a one-shot command in the container shell.
func (c *ContainerConfig) ExecArgv(hostCwd, command string) []string {
	return c.prootArgv(hostCwd, []string{"/bin/sh", "-lc", command})
}

// Env returns the extra environment proot and the guest need. LD_LIBRARY_PATH
// lets bionic resolve libtalloc.so / libandroid-shmem.so next to libproot.so.
func (c *ContainerConfig) Env() []string {
	env := []string{
		"PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
		"HOME=/root",
		"TERM=xterm-256color",
		"LANG=C.UTF-8",
		// Android kernels ship seccomp policies that break proot's syscall
		// filtering on several devices; this is the documented workaround.
		"PROOT_NO_SECCOMP=1",
		"PROOT_TMP_DIR=" + filepath.Join(c.RootfsDir, "tmp"),
	}
	if c.LibDir != "" {
		env = append(env, "LD_LIBRARY_PATH="+c.LibDir)
	}
	return env
}

// commandPackage maps a missing interpreter onto the Alpine package that
// provides it, so a first run can bootstrap itself.
var commandPackage = map[string]string{
	"node":    "nodejs",
	"npm":     "npm",
	"npx":     "npm",
	"python":  "python3",
	"python3": "python3",
	"pip3":    "py3-pip",
	"go":      "go",
	"cargo":   "cargo",
	"rustc":   "rust",
	"gcc":     "gcc",
	"g++":     "g++",
	"clang":   "clang",
	"make":    "make",
	"git":     "git",
	"zstd":    "zstd",
	"sqlite3": "sqlite",
}

// bootstrapCommand returns an apk install command for a missing binary, or "".
func bootstrapCommand(bin string) string {
	pkg, ok := commandPackage[bin]
	if !ok {
		return ""
	}
	return "apk add --no-cache " + pkg
}

// ContainerStatus is what the UI shows in the 运行环境 section.
type ContainerStatus struct {
	Mode        string `json:"mode"` // "proot" or "device"
	Ready       bool   `json:"ready"`
	ShellOK     bool   `json:"shellOk"`
	RootfsPath  string `json:"rootfsPath"`
	ProotPath   string `json:"prootPath"`
	AlpineVer   string `json:"alpineVersion"`
	GuestWork   string `json:"guestWork"`
	NodeVersion string `json:"nodeVersion"`
	Detail      string `json:"detail"`
}

func (c *ContainerConfig) Status() ContainerStatus {
	st := ContainerStatus{Mode: "device", GuestWork: c.guestWork(), Detail: "设备自带 /system/bin shell"}
	if c == nil {
		return st
	}
	st.RootfsPath = c.RootfsDir
	st.ProotPath = c.ProotPath
	if !c.Ready() {
		if c.Disabled {
			st.Detail = "容器已关闭，回退到设备 shell"
		} else {
			st.Detail = "Alpine 根文件系统尚未就绪"
		}
		return st
	}
	st.Mode = "proot"
	st.Ready = true
	st.ShellOK = c.shellErr == ""
	if b, err := os.ReadFile(filepath.Join(c.RootfsDir, "etc", "alpine-release")); err == nil {
		st.AlpineVer = strings.TrimSpace(string(b))
		st.Detail = "Alpine " + st.AlpineVer + " · proot"
	}
	if c.shellErr != "" {
		st.ShellOK = false
		st.Detail = "容器自检失败：" + c.shellErr
	}
	if b, err := os.ReadFile(filepath.Join(c.RootfsDir, "usr", "lib", "node_modules", ".pocketforge-version")); err == nil {
		st.NodeVersion = strings.TrimSpace(string(b))
	}
	return st
}

// WriteStatusSnapshot persists the status for the web layer to poll cheaply.
func (c *ContainerConfig) WriteStatusSnapshot(path string) {
	if path == "" {
		return
	}
	payload, err := json.Marshal(c.Status())
	if err != nil {
		return
	}
	_ = os.WriteFile(path, payload, 0o644)
}

// Probe runs the container shell once so a broken rootfs surfaces in the UI
// instead of only in the terminal. Returns "" when the shell works.
func (c *ContainerConfig) Probe() string {
	if !c.Ready() {
		c.shellErr = "根文件系统未就绪"
		return c.shellErr
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, c.ProotPath,
		c.prootArgv(c.Workspace, []string{"/bin/sh", "-c", "exit 0"})...)
	cmd.Env = append(os.Environ(), c.Env()...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		detail := strings.TrimSpace(string(out))
		if detail == "" {
			detail = err.Error()
		}
		// Keep one line so the sheet stays readable.
		if idx := strings.IndexByte(detail, '\n'); idx > 0 {
			detail = detail[:idx]
		}
		c.shellErr = detail
		return c.shellErr
	}
	c.shellErr = ""
	return ""
}
