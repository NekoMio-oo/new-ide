//go:build linux

package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"sync"
	"syscall"
	"time"
	"unsafe"
)

const (
	ioctlTIOCGPTN   = 0x80045430
	ioctlTIOCSPTLCK = 0x40045431
	ioctlTIOCSWINSZ = 0x5414
)

type winsize struct {
	Row    uint16
	Col    uint16
	Xpixel uint16
	Ypixel uint16
}

func openLinuxPTY(cols, rows uint16) (*os.File, *os.File, error) {
	ptmx, err := os.OpenFile("/dev/ptmx", os.O_RDWR|syscall.O_NOCTTY|syscall.O_CLOEXEC, 0)
	if err != nil {
		return nil, nil, fmt.Errorf("open /dev/ptmx: %w", err)
	}

	var unlock int32 = 0
	if _, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		ptmx.Fd(),
		uintptr(ioctlTIOCSPTLCK),
		uintptr(unsafe.Pointer(&unlock)),
	); errno != 0 {
		_ = ptmx.Close()
		return nil, nil, fmt.Errorf("TIOCSPTLCK failed: %v", errno)
	}

	var ptn uint32
	if _, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		ptmx.Fd(),
		uintptr(ioctlTIOCGPTN),
		uintptr(unsafe.Pointer(&ptn)),
	); errno != 0 {
		_ = ptmx.Close()
		return nil, nil, fmt.Errorf("TIOCGPTN failed: %v", errno)
	}

	slavePath := "/dev/pts/" + strconv.FormatUint(uint64(ptn), 10)
	slave, err := os.OpenFile(slavePath, os.O_RDWR|syscall.O_NOCTTY, 0)
	if err != nil {
		_ = ptmx.Close()
		return nil, nil, fmt.Errorf("open slave %s: %w", slavePath, err)
	}

	_ = setPTYWinsize(ptmx, cols, rows)
	return ptmx, slave, nil
}

func setPTYWinsize(ptmx *os.File, cols, rows uint16) error {
	ws := winsize{Row: rows, Col: cols}
	_, _, errno := syscall.Syscall(
		syscall.SYS_IOCTL,
		ptmx.Fd(),
		uintptr(ioctlTIOCSWINSZ),
		uintptr(unsafe.Pointer(&ws)),
	)
	if errno != 0 {
		return errno
	}
	return nil
}

type PTYSession struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Cwd     string `json:"cwd"`
	Cols    uint16 `json:"cols"`
	Rows    uint16 `json:"rows"`
	ptmx    *os.File
	cmd     *exec.Cmd
	mu      sync.RWMutex
	subs    map[int]chan string
	nextSub int
	closed  bool
}

type PTYManager struct {
	mu       sync.RWMutex
	sessions map[string]*PTYSession
	seq      int
	rootDir  string
}

func NewPTYManager(rootDir string) *PTYManager {
	return &PTYManager{
		sessions: make(map[string]*PTYSession),
		rootDir:  rootDir,
	}
}

func (m *PTYManager) Create(cwd string, cols, rows uint16) (*PTYSession, error) {
	if cols == 0 {
		cols = 80
	}
	if rows == 0 {
		rows = 24
	}
	ptmx, slave, err := openLinuxPTY(cols, rows)
	if err != nil {
		return nil, err
	}

	shellBin := os.Getenv("SHELL")
	if shellBin == "" || !fileExists(shellBin) {
		shellBin = "/bin/sh"
	}

	workDir := m.rootDir
	if cwd != "" && fileExists(cwd) {
		workDir = cwd
	}

	cmd := exec.Command(shellBin)
	cmd.Dir = workDir
	cmd.Env = append(os.Environ(),
		"TERM=xterm-256color",
		"MAKEFLAGS=-j2",
		"CARGO_BUILD_JOBS=2",
	)
	cmd.Stdin = slave
	cmd.Stdout = slave
	cmd.Stderr = slave
	cmd.SysProcAttr = &syscall.SysProcAttr{
		Setsid:  true,
		Setctty: true,
	}

	if err := cmd.Start(); err != nil {
		_ = slave.Close()
		_ = ptmx.Close()
		return nil, fmt.Errorf("start shell: %w", err)
	}
	// Parent closes slave fd after child inherits it
	_ = slave.Close()

	m.mu.Lock()
	m.seq++
	id := fmt.Sprintf("native-pty-%d", m.seq)
	session := &PTYSession{
		ID:    id,
		Title: fmt.Sprintf("Linux Shell #%d", m.seq),
		Cwd:   workDir,
		Cols:  cols,
		Rows:  rows,
		ptmx:  ptmx,
		cmd:   cmd,
		subs:  make(map[int]chan string),
	}
	m.sessions[id] = session
	m.mu.Unlock()

	go session.readLoop()
	return session, nil
}

func (s *PTYSession) readLoop() {
	buf := make([]byte, 4096)
	for {
		n, err := s.ptmx.Read(buf)
		if n > 0 {
			chunk := string(buf[:n])
			s.mu.RLock()
			for _, ch := range s.subs {
				select {
				case ch <- chunk:
				case <-time.After(750 * time.Millisecond):
					// Extremely slow consumer (dead WS peer): drop this chunk
					// instead of silently losing every burst beyond the old
					// 64-slot non-blocking buffer, while still never stalling
					// PTY reads for other subscribers indefinitely.
				}
			}
			s.mu.RUnlock()
		}
		if err != nil {
			if err != io.EOF {
				// PTY closed on process exit
			}
			break
		}
	}
}

func (s *PTYSession) WriteInput(data string) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.closed {
		return fmt.Errorf("session closed")
	}
	_, err := s.ptmx.Write([]byte(data))
	return err
}

func (s *PTYSession) Resize(cols, rows uint16) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return fmt.Errorf("session closed")
	}
	s.Cols = cols
	s.Rows = rows
	return setPTYWinsize(s.ptmx, cols, rows)
}

func (s *PTYSession) Subscribe() (int, <-chan string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	id := s.nextSub
	s.nextSub++
	ch := make(chan string, 512)
	s.subs[id] = ch
	return id, ch
}

func (s *PTYSession) Unsubscribe(subID int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ch, ok := s.subs[subID]; ok {
		delete(s.subs, subID)
		close(ch)
	}
}

func (s *PTYSession) Close() {
	s.mu.Lock()
	if s.closed {
		s.mu.Unlock()
		return
	}
	s.closed = true
	for id, ch := range s.subs {
		delete(s.subs, id)
		close(ch)
	}
	s.mu.Unlock()

	_ = s.ptmx.Close()
	if s.cmd != nil && s.cmd.Process != nil {
		_ = s.cmd.Process.Kill()
		_, _ = s.cmd.Process.Wait()
	}
}

func (m *PTYManager) Get(id string) (*PTYSession, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	s, ok := m.sessions[id]
	return s, ok
}

func (m *PTYManager) Kill(id string) {
	m.mu.Lock()
	s, ok := m.sessions[id]
	if ok {
		delete(m.sessions, id)
	}
	m.mu.Unlock()
	if ok {
		s.Close()
	}
}

func fileExists(p string) bool {
	_, err := os.Stat(p)
	return err == nil
}
