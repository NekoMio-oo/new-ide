#!/usr/bin/env python3
"""
PocketForge Offline Toolchain Pack Builder & Verifier.
Packages compiler/LSP directories into offline archives (.tar.gz / .tar.zst)
with SHA-256 integrity manifests for air-gapped mobile import.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timezone
from pathlib import Path


def compute_sha256(filepath: Path) -> str:
    digest = hashlib.sha256()
    with filepath.open("rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def build_pack(pack_id: str, version: str, source_dir: Path, output_dir: Path) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    zstd_bin = shutil.which("zstd")

    raw_tar = output_dir / f"{pack_id}-{version}.tar"
    file_entries: list[str] = []

    with tarfile.open(raw_tar, "w") as tf:
        for item in sorted(source_dir.rglob("*")):
            rel = item.relative_to(source_dir).as_posix()
            tf.add(item, arcname=rel)
            if item.is_file():
                file_entries.append(rel)

    if zstd_bin:
        final_archive = output_dir / f"{pack_id}-{version}.tar.zst"
        subprocess.run([zstd_bin, "-q", "-19", "-f", str(raw_tar), "-o", str(final_archive)], check=True)
        raw_tar.unlink(missing_ok=True)
    else:
        final_archive = output_dir / f"{pack_id}-{version}.tar.gz"
        with tarfile.open(final_archive, "w:gz") as gz_tf:
            for item in sorted(source_dir.rglob("*")):
                rel = item.relative_to(source_dir).as_posix()
                gz_tf.add(item, arcname=rel)
        raw_tar.unlink(missing_ok=True)

    sha256_hex = compute_sha256(final_archive)
    manifest = {
        "packId": pack_id,
        "version": version,
        "archiveName": final_archive.name,
        "sizeBytes": final_archive.stat().st_size,
        "sha256": sha256_hex,
        "fileCount": len(file_entries),
        "files": file_entries,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    manifest_path = output_dir / f"{pack_id}-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return final_archive


def create_sample_source(tmp_root: Path, pack_id: str) -> Path:
    src = tmp_root / pack_id
    (src / "bin").mkdir(parents=True, exist_ok=True)
    wrapper = src / "bin" / "pocketforge-pack-info"
    wrapper.write_text(f"#!/bin/sh\necho 'PocketForge Offline Pack: {pack_id}'\n", encoding="utf-8")
    os.chmod(wrapper, 0o755)
    return src


def main() -> None:
    parser = argparse.ArgumentParser(description="Build PocketForge offline toolchain archive")
    parser.add_argument("--pack-id", required=True, help="Pack identifier, e.g. pack-cc or pack-android")
    parser.add_argument("--version", default="1.0.0-arm64", help="Toolchain version tag")
    parser.add_argument("--source-dir", help="Source directory containing bin/, lib/, include/")
    parser.add_argument("--output-dir", required=True, help="Destination directory for archive + manifest")
    parser.add_argument("--create-sample", action="store_true", help="Create a lightweight sample pack for verification")
    args = parser.parse_args()

    out_dir = Path(args.output_dir).resolve()
    if args.create_sample:
        with tempfile.TemporaryDirectory() as tmp:
            sample_src = create_sample_source(Path(tmp), args.pack_id)
            archive = build_pack(args.pack_id, args.version, sample_src, out_dir)
    else:
        if not args.source_dir:
            raise SystemExit("--source-dir is required unless --create-sample is set")
        archive = build_pack(args.pack_id, args.version, Path(args.source_dir).resolve(), out_dir)

    print(f"Built offline pack: {archive}")


if __name__ == "__main__":
    main()
