package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"
)

func main() {
	port := flag.Int("port", 19527, "Loopback TCP port for PocketForge Native Daemon")
	workspace := flag.String("workspace", "", "Workspace directory path")
	toolchains := flag.String("toolchains", "", "Offline toolchains root directory")
	lspIdleSec := flag.Int("lsp-idle-sec", 300, "Idle seconds before hibernating LSP servers")
	rootfs := flag.String("rootfs", "", "Alpine rootfs directory for the proot container")
	proot := flag.String("proot", "", "proot executable shipped in nativeLibraryDir")
	prootLibs := flag.String("proot-libs", "", "Directory holding libtalloc.so and libandroid-shmem.so")
	rootfsArchive := flag.String("rootfs-archive", "", "Bundled minirootfs tarball, extracted on first run")
	containerMode := flag.String("container", "auto", "Container mode: auto|off")
	flag.Parse()

	home, _ := os.UserHomeDir()
	wsDir := *workspace
	if wsDir == "" {
		wsDir = filepath.Join(home, "pocketforge-workspace")
	}
	tcDir := *toolchains
	if tcDir == "" {
		tcDir = filepath.Join(home, ".toolchains")
	}

	container := &ContainerConfig{
		RootfsDir:   *rootfs,
		ProotPath:   *proot,
		LibDir:      *prootLibs,
		ArchivePath: *rootfsArchive,
		Workspace:   wsDir,
		GuestWork:   defaultGuestWork,
		Disabled:    *containerMode == "off",
	}
	// Provisioning is idempotent; a failure must not stop the daemon, the PTY
	// and exec paths simply keep using the device shell.
	if err := container.EnsureRootfs(); err != nil {
		log.Printf("[container] alpine rootfs unavailable, using device shell: %v", err)
	} else if container.Ready() {
		log.Printf("[container] alpine ready at %s (proot %s)", container.RootfsDir, container.ProotPath)
	}

	daemon := NewDaemonServer(wsDir, tcDir, time.Duration(*lspIdleSec)*time.Second, container)
	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("[PocketForge Daemon] listening on http://%s (workspace=%s, container=%s)", addr, wsDir, container.Status().Mode)

	srv := &http.Server{
		Addr:              addr,
		Handler:           daemon.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	if err := srv.ListenAndServe(); err != nil {
		log.Fatalf("daemon exited: %v", err)
	}
}
