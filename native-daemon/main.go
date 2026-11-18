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

	srv := NewDaemonServer(wsDir, tcDir, time.Duration(*lspIdleSec)*time.Second)
	addr := fmt.Sprintf("127.0.0.1:%d", *port)
	log.Printf("[PocketForge Daemon] listening on http://%s (workspace=%s)", addr, wsDir)

	if err := http.ListenAndServe(addr, srv.Handler()); err != nil {
		log.Fatalf("daemon exited: %v", err)
	}
}
