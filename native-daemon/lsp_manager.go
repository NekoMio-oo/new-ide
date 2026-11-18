package main

import (
	"fmt"
	"os/exec"
	"sync"
	"time"
)

type LSPServerStatus struct {
	Language     string    `json:"language"`
	Command      string    `json:"command"`
	PID          int       `json:"pid"`
	Running      bool      `json:"running"`
	LastActiveAt time.Time `json:"lastActiveAt"`
}

type managedLSP struct {
	language     string
	binary       string
	args         []string
	cmd          *exec.Cmd
	lastActiveAt time.Time
}

// LSPSupervisor starts language servers lazily on demand and automatically
// hibernates/terminates idle LSP processes to save mobile RAM and battery.
type LSPSupervisor struct {
	mu          sync.Mutex
	servers     map[string]*managedLSP
	idleTimeout time.Duration
	stopCh      chan struct{}
}

var defaultLSPRegistry = map[string][]string{
	"typescript": {"typescript-language-server", "--stdio"},
	"python":     {"ruff", "server"},
	"cpp":        {"clangd", "--background-index=false"},
	"rust":       {"rust-analyzer"},
	"go":         {"gopls"},
	"kotlin":     {"kotlin-language-server"},
}

func NewLSPSupervisor(idleTimeout time.Duration) *LSPSupervisor {
	if idleTimeout <= 0 {
		idleTimeout = 5 * time.Minute
	}
	sup := &LSPSupervisor{
		servers:     make(map[string]*managedLSP),
		idleTimeout: idleTimeout,
		stopCh:      make(chan struct{}),
	}
	go sup.reaperLoop()
	return sup
}

func (s *LSPSupervisor) RegisterCustomBinary(language string, binary string, args ...string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.servers[language] = &managedLSP{
		language: language,
		binary:   binary,
		args:     args,
	}
}

func (s *LSPSupervisor) TouchOrStart(language string) (LSPServerStatus, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, exists := s.servers[language]
	if !exists {
		spec, ok := defaultLSPRegistry[language]
		if !ok {
			return LSPServerStatus{}, fmt.Errorf("unsupported LSP language: %s", language)
		}
		entry = &managedLSP{
			language: language,
			binary:   spec[0],
			args:     spec[1:],
		}
		s.servers[language] = entry
	}

	entry.lastActiveAt = time.Now()
	if entry.cmd != nil && entry.cmd.Process != nil {
		return LSPServerStatus{
			Language:     language,
			Command:      entry.binary,
			PID:          entry.cmd.Process.Pid,
			Running:      true,
			LastActiveAt: entry.lastActiveAt,
		}, nil
	}

	path, err := exec.LookPath(entry.binary)
	if err != nil {
		return LSPServerStatus{
			Language:     language,
			Command:      entry.binary,
			PID:          0,
			Running:      false,
			LastActiveAt: entry.lastActiveAt,
		}, fmt.Errorf("LSP binary %q not yet mounted in offline toolchain: %w", entry.binary, err)
	}

	cmd := exec.Command(path, entry.args...)
	if err := cmd.Start(); err != nil {
		return LSPServerStatus{}, err
	}
	entry.cmd = cmd
	go func(m *managedLSP, proc *exec.Cmd) {
		_ = proc.Wait()
		s.mu.Lock()
		if m.cmd == proc {
			m.cmd = nil
		}
		s.mu.Unlock()
	}(entry, cmd)

	return LSPServerStatus{
		Language:     language,
		Command:      entry.binary,
		PID:          cmd.Process.Pid,
		Running:      true,
		LastActiveAt: entry.lastActiveAt,
	}, nil
}

func (s *LSPSupervisor) ListStatuses() []LSPServerStatus {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]LSPServerStatus, 0, len(s.servers))
	for _, entry := range s.servers {
		pid := 0
		running := false
		if entry.cmd != nil && entry.cmd.Process != nil {
			pid = entry.cmd.Process.Pid
			running = true
		}
		out = append(out, LSPServerStatus{
			Language:     entry.language,
			Command:      entry.binary,
			PID:          pid,
			Running:      running,
			LastActiveAt: entry.lastActiveAt,
		})
	}
	return out
}

func (s *LSPSupervisor) ReapIdleNow() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	reaped := 0
	for _, entry := range s.servers {
		if entry.cmd != nil && entry.cmd.Process != nil && now.Sub(entry.lastActiveAt) >= s.idleTimeout {
			_ = entry.cmd.Process.Kill()
			entry.cmd = nil
			reaped++
		}
	}
	return reaped
}

func (s *LSPSupervisor) reaperLoop() {
	interval := s.idleTimeout / 2
	if interval < 20*time.Millisecond {
		interval = 20 * time.Millisecond
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			s.ReapIdleNow()
		case <-s.stopCh:
			return
		}
	}
}

func (s *LSPSupervisor) Shutdown() {
	close(s.stopCh)
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, entry := range s.servers {
		if entry.cmd != nil && entry.cmd.Process != nil {
			_ = entry.cmd.Process.Kill()
			entry.cmd = nil
		}
	}
}
