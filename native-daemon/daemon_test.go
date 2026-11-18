package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestPTYCreateWriteAndResize(t *testing.T) {
	tmp := t.TempDir()
	mgr := NewPTYManager(tmp)

	session, err := mgr.Create(tmp, 80, 24)
	if err != nil {
		t.Fatalf("Create PTY failed: %v", err)
	}
	defer mgr.Kill(session.ID)

	subID, outCh := session.Subscribe()
	defer session.Unsubscribe(subID)

	if err := session.Resize(100, 32); err != nil {
		t.Fatalf("Resize PTY failed: %v", err)
	}

	if err := session.WriteInput("echo POCKETFORGE_PTY_OK\n"); err != nil {
		t.Fatalf("WriteInput failed: %v", err)
	}

	deadline := time.After(3 * time.Second)
	var collected strings.Builder
	for !strings.Contains(collected.String(), "POCKETFORGE_PTY_OK") {
		select {
		case chunk := <-outCh:
			collected.WriteString(chunk)
		case <-deadline:
			t.Fatalf("timed out waiting for PTY output, got: %q", collected.String())
		}
	}
}

func TestDaemonExecAndPhantomProcessLimits(t *testing.T) {
	tmp := t.TempDir()
	ds := NewDaemonServer(tmp, filepath.Join(tmp, "tc"), 50*time.Millisecond)
	defer ds.LSP.Shutdown()

	ts := httptest.NewServer(ds.Handler())
	defer ts.Close()

	body, _ := json.Marshal(map[string]any{
		"command": "printf '%s|%s' \"$MAKEFLAGS\" \"$CARGO_BUILD_JOBS\"",
	})
	resp, err := http.Post(ts.URL+"/api/exec", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatalf("POST /api/exec failed: %v", err)
	}
	defer resp.Body.Close()

	var result struct {
		ExitCode int    `json:"exitCode"`
		Stdout   string `json:"stdout"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if result.ExitCode != 0 || result.Stdout != "-j2|2" {
		t.Fatalf("unexpected exec output: exit=%d stdout=%q", result.ExitCode, result.Stdout)
	}
}

func TestToolchainArchiveInstallAndTraversalGuard(t *testing.T) {
	tmp := t.TempDir()
	store := NewToolchainStore(filepath.Join(tmp, "toolchains"))

	// 1. Valid .tar.gz offline pack
	validArchive := filepath.Join(tmp, "pack-cc.tar.gz")
	writeTestTarGz(t, validArchive, map[string]string{
		"bin/clang": "ELF_MOCK",
	})
	sum, err := ComputeFileSHA256(validArchive)
	if err != nil {
		t.Fatalf("ComputeFileSHA256: %v", err)
	}

	meta, err := store.InstallOfflineArchive("pack-cc", validArchive, sum)
	if err != nil {
		t.Fatalf("InstallOfflineArchive failed: %v", err)
	}
	if meta.FileCount != 1 {
		t.Fatalf("expected 1 extracted file, got %d", meta.FileCount)
	}

	// 2. Malicious Tar-Slip path traversal archive MUST be rejected
	evilArchive := filepath.Join(tmp, "evil.tar.gz")
	writeTestTarGz(t, evilArchive, map[string]string{
		"../../escaped.txt": "pwned",
	})
	if _, err := store.InstallOfflineArchive("pack-evil", evilArchive, ""); err == nil {
		t.Fatalf("expected path traversal archive to be rejected, but succeeded")
	}
}

func TestLSPIdleAutoHibernation(t *testing.T) {
	sup := NewLSPSupervisor(80 * time.Millisecond)
	defer sup.Shutdown()

	sup.RegisterCustomBinary("mocklang", "/bin/sleep", "10")
	st, err := sup.TouchOrStart("mocklang")
	if err != nil || !st.Running {
		t.Fatalf("expected mock LSP to start: st=%+v err=%v", st, err)
	}

	time.Sleep(220 * time.Millisecond)
	statuses := sup.ListStatuses()
	if len(statuses) != 1 || statuses[0].Running {
		t.Fatalf("expected idle LSP process to be auto-hibernated, got: %+v", statuses)
	}
}

func writeTestTarGz(t *testing.T, dest string, files map[string]string) {
	t.Helper()
	f, err := os.Create(dest)
	if err != nil {
		t.Fatalf("create tar.gz: %v", err)
	}
	defer f.Close()

	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	for name, content := range files {
		hdr := &tar.Header{
			Name: name,
			Mode: 0o755,
			Size: int64(len(content)),
		}
		if err := tw.WriteHeader(hdr); err != nil {
			t.Fatalf("write header: %v", err)
		}
		if _, err := tw.Write([]byte(content)); err != nil {
			t.Fatalf("write content: %v", err)
		}
	}
	_ = tw.Close()
	_ = gz.Close()
}
