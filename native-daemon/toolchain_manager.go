package main

import (
	"archive/tar"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type InstalledPackMeta struct {
	PackID    string `json:"packId"`
	SHA256    string `json:"sha256"`
	TargetDir string `json:"targetDir"`
	FileCount int    `json:"fileCount"`
}

type ToolchainStore struct {
	BaseDir string
}

func NewToolchainStore(baseDir string) *ToolchainStore {
	_ = os.MkdirAll(baseDir, 0o755)
	return &ToolchainStore{BaseDir: baseDir}
}

func ComputeFileSHA256(archivePath string) (string, error) {
	f, err := os.Open(archivePath)
	if err != nil {
		return "", err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

// InstallOfflineArchive verifies optional expectedSHA256 and safely extracts
// .tar.gz or .tar.zst offline SDK packs while preventing Zip-Slip path traversal.
func (ts *ToolchainStore) InstallOfflineArchive(
	packID string,
	archivePath string,
	expectedSHA256 string,
) (*InstalledPackMeta, error) {
	cleanID := filepath.Base(packID)
	if cleanID == "." || cleanID == ".." || cleanID == "" {
		return nil, fmt.Errorf("invalid pack id: %q", packID)
	}

	actualSum, err := ComputeFileSHA256(archivePath)
	if err != nil {
		return nil, fmt.Errorf("checksum calculation failed: %w", err)
	}
	if expectedSHA256 != "" && !strings.EqualFold(actualSum, expectedSHA256) {
		return nil, fmt.Errorf("SHA256 mismatch: expected %s, got %s", expectedSHA256, actualSum)
	}

	destRoot := filepath.Join(ts.BaseDir, cleanID)
	if err := os.MkdirAll(destRoot, 0o755); err != nil {
		return nil, err
	}

	// If .tar.zst and system zstd binary is present in container, stream via zstd -dc
	if strings.HasSuffix(strings.ToLower(archivePath), ".tar.zst") || strings.HasSuffix(strings.ToLower(archivePath), ".tzst") {
		zstdBin, lookErr := exec.LookPath("zstd")
		if lookErr != nil {
			return nil, fmt.Errorf("zstd binary required for .tar.zst extraction: %w", lookErr)
		}
		cmd := exec.Command(zstdBin, "-dc", archivePath)
		stdout, err := cmd.StdoutPipe()
		if err != nil {
			return nil, err
		}
		if err := cmd.Start(); err != nil {
			return nil, err
		}
		count, extractErr := extractTarStreamSafely(stdout, destRoot)
		waitErr := cmd.Wait()
		if extractErr != nil {
			return nil, extractErr
		}
		if waitErr != nil {
			return nil, waitErr
		}
		return &InstalledPackMeta{
			PackID:    cleanID,
			SHA256:    actualSum,
			TargetDir: destRoot,
			FileCount: count,
		}, nil
	}

	f, err := os.Open(archivePath)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var reader io.Reader = f
	if strings.HasSuffix(strings.ToLower(archivePath), ".gz") || strings.HasSuffix(strings.ToLower(archivePath), ".tgz") {
		gz, err := gzip.NewReader(f)
		if err != nil {
			return nil, fmt.Errorf("open gzip stream: %w", err)
		}
		defer gz.Close()
		reader = gz
	}

	count, err := extractTarStreamSafely(reader, destRoot)
	if err != nil {
		return nil, err
	}
	return &InstalledPackMeta{
		PackID:    cleanID,
		SHA256:    actualSum,
		TargetDir: destRoot,
		FileCount: count,
	}, nil
}

func extractTarStreamSafely(r io.Reader, destRoot string) (int, error) {
	absRoot, err := filepath.Abs(destRoot)
	if err != nil {
		return 0, err
	}
	tr := tar.NewReader(r)
	count := 0

	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return count, fmt.Errorf("read tar entry: %w", err)
		}

		// Guard against Zip-Slip / Tar-Slip directory traversal
		cleanRel := filepath.Clean(hdr.Name)
		if strings.HasPrefix(cleanRel, "..") || filepath.IsAbs(cleanRel) {
			return count, fmt.Errorf("unsafe archive entry path rejected: %q", hdr.Name)
		}
		targetPath := filepath.Join(absRoot, cleanRel)
		if targetPath != absRoot && !strings.HasPrefix(targetPath, absRoot+string(os.PathSeparator)) {
			return count, fmt.Errorf("archive path escapes destination root: %q", hdr.Name)
		}

		switch hdr.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(targetPath, 0o755); err != nil {
				return count, err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(targetPath), 0o755); err != nil {
				return count, err
			}
			mode := os.FileMode(hdr.Mode) & 0o777
			if mode == 0 {
				mode = 0o644
			}
			out, err := os.OpenFile(targetPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return count, err
			}
			if _, err := io.Copy(out, tr); err != nil {
				_ = out.Close()
				return count, err
			}
			_ = out.Close()
			count++
		}
	}
	return count, nil
}

// BuildFastAPKPlan generates the lightweight single-module Android offline APK build commands
// (kotlinc/javac -> d8 -> aapt2 -> apksigner) bypassing heavy Gradle Daemon memory overhead.
func BuildFastAPKPlan(projectDir string, sdkRoot string) []string {
	outDir := filepath.Join(projectDir, "build", "outputs")
	return []string{
		fmt.Sprintf("mkdir -p %q", outDir),
		fmt.Sprintf("%s link -o %q/unsigned.apk --manifest %q/AndroidManifest.xml -I %q/android.jar",
			filepath.Join(sdkRoot, "bin", "aapt2"), outDir, projectDir, sdkRoot),
		fmt.Sprintf("%s %q/src -d %q/classes.jar -cp %q/android.jar",
			filepath.Join(sdkRoot, "bin", "kotlinc"), projectDir, outDir, sdkRoot),
		fmt.Sprintf("%s --min-api 26 --output %q %q/classes.jar",
			filepath.Join(sdkRoot, "bin", "d8"), outDir, outDir),
		fmt.Sprintf("%s sign --ks %q/debug.keystore --out %q/app-debug.apk %q/unsigned.apk",
			filepath.Join(sdkRoot, "bin", "apksigner"), sdkRoot, outDir, outDir),
	}
}
