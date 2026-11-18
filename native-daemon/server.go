package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

type DaemonServer struct {
	WorkspaceDir string
	PTY          *PTYManager
	LSP          *LSPSupervisor
	Toolchains   *ToolchainStore
}

func NewDaemonServer(workspaceDir string, toolchainDir string, lspIdleTimeout time.Duration) *DaemonServer {
	_ = os.MkdirAll(workspaceDir, 0o755)
	return &DaemonServer{
		WorkspaceDir: workspaceDir,
		PTY:          NewPTYManager(workspaceDir),
		LSP:          NewLSPSupervisor(lspIdleTimeout),
		Toolchains:   NewToolchainStore(toolchainDir),
	}
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
			_ = json.NewDecoder(r.Body).Decode(&req)
			cwd := ds.WorkspaceDir
			if req.Cwd != "" {
				cwd = filepath.Join(ds.WorkspaceDir, filepath.Clean(req.Cwd))
			}
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
		cmd := exec.Command("/bin/sh", "-c", req.Command)
		cmd.Dir = ds.WorkspaceDir
		if req.Cwd != "" {
			candidate := filepath.Join(ds.WorkspaceDir, filepath.Clean(req.Cwd))
			if fileExists(candidate) {
				cmd.Dir = candidate
			}
		}

		// Enforce Android Phantom Process Killer safe concurrency defaults
		envList := append(os.Environ(),
			"MAKEFLAGS=-j2",
			"CARGO_BUILD_JOBS=2",
			"GOMAXPROCS=2",
		)
		for k, v := range req.Env {
			envList = append(envList, k+"="+v)
		}
		cmd.Env = envList

		var stdout, stderr bytes.Buffer
		cmd.Stdout = &stdout
		cmd.Stderr = &stderr

		err := cmd.Run()
		exitCode := 0
		if err != nil {
			if exitErr, ok := err.(*exec.ExitError); ok {
				exitCode = exitErr.ExitCode()
			} else {
				exitCode = 1
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"exitCode":   exitCode,
			"stdout":     stdout.String(),
			"stderr":     stderr.String(),
			"durationMs": time.Since(t0).Milliseconds(),
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

func withLocalCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
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
