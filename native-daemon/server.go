package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

type DaemonServer struct {
	WorkspaceDir string
	PTY          *PTYManager
	LSP          *LSPSupervisor
	Toolchains   *ToolchainStore
	Container    *ContainerConfig
}

func NewDaemonServer(workspaceDir string, toolchainDir string, lspIdleTimeout time.Duration, container *ContainerConfig) *DaemonServer {
	_ = os.MkdirAll(workspaceDir, 0o755)
	return &DaemonServer{
		WorkspaceDir: workspaceDir,
		PTY:          NewPTYManager(workspaceDir, container),
		LSP:          NewLSPSupervisor(lspIdleTimeout),
		Toolchains:   NewToolchainStore(toolchainDir),
		Container:    container,
	}
}

// resolveInsideWorkspace maps a client-supplied relative path onto the
// workspace root, falling back to the root itself when the path would escape
// it (filepath.Clean alone does not neutralize leading ".." here).
func (ds *DaemonServer) resolveInsideWorkspace(raw string) string {
	if raw == "" {
		return ds.WorkspaceDir
	}
	joined := filepath.Join(ds.WorkspaceDir, filepath.Clean(raw))
	if joined != ds.WorkspaceDir && !strings.HasPrefix(joined, ds.WorkspaceDir+string(os.PathSeparator)) {
		return ds.WorkspaceDir
	}
	return joined
}

func (ds *DaemonServer) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":       "ok",
			"pid":          os.Getpid(),
			"workspaceDir": ds.WorkspaceDir,
		})
	})

	mux.HandleFunc("/api/pty", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			var req struct {
				Cwd  string `json:"cwd"`
				Cols uint16 `json:"cols"`
				Rows uint16 `json:"rows"`
			}
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body: " + err.Error()})
				return
			}
			cwd := ds.resolveInsideWorkspace(req.Cwd)
			session, err := ds.PTY.Create(cwd, req.Cols, req.Rows)
			if err != nil {
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
				return
			}
			writeJSON(w, http.StatusOK, session)
			return
		}
		if r.Method == http.MethodDelete {
			id := r.URL.Query().Get("id")
			ds.PTY.Kill(id)
			writeJSON(w, http.StatusOK, map[string]bool{"killed": true})
			return
		}
		w.WriteHeader(http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/ws/pty", func(w http.ResponseWriter, r *http.Request) {
		id := r.URL.Query().Get("id")
		session, ok := ds.PTY.Get(id)
		if !ok {
			http.Error(w, "PTY session not found", http.StatusNotFound)
			return
		}
		ws, err := upgradeWebSocket(w, r)
		if err != nil {
			return
		}
		defer ws.Close()

		subID, outCh := session.Subscribe()
		defer session.Unsubscribe(subID)

		done := make(chan struct{})
		go func() {
			defer close(done)
			for chunk := range outCh {
				if err := ws.WriteTextFrame(chunk); err != nil {
					return
				}
			}
		}()

		for {
			msg, err := ws.ReadTextFrame()
			if err != nil {
				break
			}
			var ctrl struct {
				Type string `json:"type"`
				Data string `json:"data"`
				Cols uint16 `json:"cols"`
				Rows uint16 `json:"rows"`
			}
			if err := json.Unmarshal([]byte(msg), &ctrl); err == nil {
				switch ctrl.Type {
				case "input":
					_ = session.WriteInput(ctrl.Data)
				case "resize":
					_ = session.Resize(ctrl.Cols, ctrl.Rows)
				}
			}
		}
		<-done
	})

	mux.HandleFunc("/api/container", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, ds.Container.Status())
	})

	mux.HandleFunc("/api/container/provision", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if ds.Container == nil {
			writeJSON(w, http.StatusOK, ContainerStatus{Mode: "device", Detail: "未配置容器"})
			return
		}
		if err := ds.Container.EnsureRootfs(); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		// Optional package list so the host can pre-install nodejs once.
		var req struct {
			Packages []string `json:"packages"`
		}
		_ = json.NewDecoder(r.Body).Decode(&req)
		if len(req.Packages) > 0 && ds.Container.Ready() {
			pkgs := strings.Join(req.Packages, " ")
			ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
			defer cancel()
			out := ds.runContainerCommand(ctx, "apk add --no-cache "+pkgs, ds.WorkspaceDir, nil)
			if out.ExitCode != 0 {
				writeJSON(w, http.StatusOK, map[string]any{
					"status": ds.Container.Status(),
					"error":  strings.TrimSpace(out.Stderr + out.Stdout),
				})
				return
			}
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": ds.Container.Status()})
	})

	// The editor keeps its files in the WebView VFS, so the container has to be
	// seeded before a run or a shell can see them. Paths are workspace-relative.
	mux.HandleFunc("/api/fs/sync", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Dirs  []string `json:"dirs"`
			Files []struct {
				Path    string `json:"path"`
				Content string `json:"content"`
				Base64  bool   `json:"base64"`
			} `json:"files"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		written := 0
		for _, d := range req.Dirs {
			target, err := ds.workspacePath(d)
			if err != nil {
				continue
			}
			_ = os.MkdirAll(target, 0o755)
		}
		for _, f := range req.Files {
			target, err := ds.workspacePath(f.Path)
			if err != nil {
				continue
			}
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				continue
			}
			data := []byte(f.Content)
			if f.Base64 {
				if decoded, decErr := base64.StdEncoding.DecodeString(f.Content); decErr == nil {
					data = decoded
				}
			}
			if err := os.WriteFile(target, data, 0o644); err != nil {
				continue
			}
			written++
		}
		writeJSON(w, http.StatusOK, map[string]any{"written": written, "root": ds.WorkspaceDir})
	})

	mux.HandleFunc("/api/exec", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			Command string            `json:"command"`
			Cwd     string            `json:"cwd"`
			Env     map[string]string `json:"env"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		t0 := time.Now()
		// Hard timeout so a runaway build (e.g. `sleep infinity`) cannot hold
		// the HTTP request forever with no way to kill it.
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
		defer cancel()

		out := ds.runExec(ctx, req.Command, req.Cwd, req.Env)

		// Inside the container a missing interpreter is expected on first use
		// (nodejs, python3, …): install it once and retry, instead of failing
		// the run with a bare "not found".
		bootstrapped := ""
		if out.ExitCode == 127 && ds.Container.Ready() {
			if cmd := bootstrapCommand(firstCommandToken(req.Command)); cmd != "" {
				install := ds.runContainerCommand(ctx, cmd, ds.WorkspaceDir, req.Env)
				out.Stdout += install.Stdout
				out.Stderr += install.Stderr
				if install.ExitCode == 0 {
					bootstrapped = cmd
					ds.recordToolVersion()
					out = ds.runExec(ctx, req.Command, req.Cwd, req.Env)
					out.Stdout = install.Stdout + out.Stdout
				}
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"exitCode":     out.ExitCode,
			"stdout":       out.Stdout,
			"stderr":       out.Stderr,
			"durationMs":   time.Since(t0).Milliseconds(),
			"container":    ds.Container.Ready(),
			"bootstrapped": bootstrapped,
		})
	})

	mux.HandleFunc("/api/toolchains/install", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req struct {
			PackID         string `json:"packId"`
			ArchivePath    string `json:"archivePath"`
			ExpectedSHA256 string `json:"expectedSha256"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		meta, err := ds.Toolchains.InstallOfflineArchive(req.PackID, req.ArchivePath, req.ExpectedSHA256)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, meta)
	})

	mux.HandleFunc("/api/lsp/status", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, ds.LSP.ListStatuses())
	})

	return withLocalCORS(mux)
}

// isAllowedLocalOrigin only permits browser pages served from the device
// itself: the Capacitor WebView (capacitor://localhost or https://localhost,
// per androidScheme) and local dev servers on 127.0.0.1/localhost. Requests
// without an Origin header (native clients such as the Android host app or
// curl) are allowed because the daemon only listens on 127.0.0.1. This blocks
// drive-by attacks where an arbitrary website open in any browser on the
// device drives /api/exec or /ws/pty.
func isAllowedLocalOrigin(origin string) bool {
	if origin == "" {
		return true
	}
	u, err := url.Parse(origin)
	if err != nil {
		return false
	}
	host := u.Hostname()
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func withLocalCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if !isAllowedLocalOrigin(origin) {
			http.Error(w, "origin not allowed", http.StatusForbidden)
			return
		}
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Add("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

// workspacePath validates a workspace-relative path (VFS sync payloads).
func (ds *DaemonServer) workspacePath(rel string) (string, error) {
	clean := filepath.Clean(strings.TrimPrefix(rel, "/"))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", fmt.Errorf("invalid path: %q", rel)
	}
	target := filepath.Join(ds.WorkspaceDir, clean)
	if target != ds.WorkspaceDir && !strings.HasPrefix(target, ds.WorkspaceDir+string(os.PathSeparator)) {
		return "", fmt.Errorf("path escapes workspace: %q", rel)
	}
	return target, nil
}

type execResult struct {
	ExitCode int
	Stdout   string
	Stderr   string
}

// runExec executes a shell command either inside the Alpine container or with
// the device shell, capturing both streams.
func (ds *DaemonServer) runExec(ctx context.Context, command, cwd string, extraEnv map[string]string) execResult {
	workDir := ds.resolveInsideWorkspace(cwd)
	if cwd != "" && !fileExists(workDir) {
		workDir = ds.WorkspaceDir
	}

	var cmd *exec.Cmd
	inContainer := ds.Container.Ready()
	if inContainer {
		cmd = exec.CommandContext(ctx, ds.Container.ProotPath, ds.Container.ExecArgv(workDir, command)...)
	} else {
		cmd = exec.CommandContext(ctx, "/bin/sh", "-c", command)
	}
	cmd.Dir = workDir

	// Run children in their own process group so the timeout kills the whole
	// toolchain tree, not just the top-level shell.
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		if cmd.Process != nil {
			return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		return nil
	}
	cmd.WaitDelay = 5 * time.Second

	// Enforce Android Phantom Process Killer safe concurrency defaults.
	envList := append(os.Environ(),
		"MAKEFLAGS=-j2",
		"CARGO_BUILD_JOBS=2",
		"GOMAXPROCS=2",
	)
	if inContainer {
		envList = append(envList, ds.Container.Env()...)
	}
	for k, v := range extraEnv {
		envList = append(envList, k+"="+v)
	}
	cmd.Env = envList

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	exitCode := 0
	if err := cmd.Run(); err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = 1
			if stderr.Len() == 0 {
				stderr.WriteString(err.Error())
			}
		}
	}
	return execResult{ExitCode: exitCode, Stdout: stdout.String(), Stderr: stderr.String()}
}

// runContainerCommand always targets the container (used for apk bootstrap).
func (ds *DaemonServer) runContainerCommand(ctx context.Context, command, cwd string, extraEnv map[string]string) execResult {
	if !ds.Container.Ready() {
		return execResult{ExitCode: 127, Stderr: "container not ready"}
	}
	return ds.runExec(ctx, command, cwd, extraEnv)
}

// firstCommandToken extracts the program name from a shell command line,
// skipping leading VAR=value assignments and absolute paths.
func firstCommandToken(command string) string {
	for _, field := range strings.Fields(command) {
		if strings.Contains(field, "=") && !strings.HasPrefix(field, "=") {
			continue
		}
		field = strings.Trim(field, `"'`)
		if idx := strings.LastIndex(field, "/"); idx >= 0 {
			field = field[idx+1:]
		}
		return field
	}
	return ""
}

// recordToolVersion stores the container's node version so the UI can show it
// without paying for an extra exec on every status poll.
func (ds *DaemonServer) recordToolVersion() {
	if !ds.Container.Ready() {
		return
	}
	out := ds.runContainerCommand(context.Background(), "node -v", ds.WorkspaceDir, nil)
	version := strings.TrimSpace(out.Stdout)
	if out.ExitCode != 0 || version == "" {
		return
	}
	target := filepath.Join(ds.Container.RootfsDir, "usr", "lib", "node_modules", ".pocketforge-version")
	_ = os.MkdirAll(filepath.Dir(target), 0o755)
	_ = os.WriteFile(target, []byte(version+"\n"), 0o644)
}
