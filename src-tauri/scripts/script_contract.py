"""
Shared helpers for scripted pipeline stdout JSON.

Contract: see src-tauri/docs/SCRIPT_SUCCESS_PAYLOAD.md (relative to repo: src-tauri/docs/).
"""

from __future__ import annotations

import os


def relative_output_paths_for_json(output_dir: str, *paths: str) -> list[str]:
    """
    Map absolute or normalized paths under output_dir to relative paths for the success JSON
    "outputs" array. Uses forward slashes for portability in JSON.

    Every path must lie under output_dir (after abspath resolution); otherwise ValueError.
    """
    root = os.path.abspath(os.path.normpath(output_dir))
    out: list[str] = []
    for p in paths:
        abs_p = os.path.abspath(os.path.normpath(p))
        rel = os.path.relpath(abs_p, root)
        if rel.startswith(".."):
            raise ValueError(f"path is not under output_dir {output_dir!r}: {p!r}")
        out.append(rel.replace("\\", "/"))
    return out
