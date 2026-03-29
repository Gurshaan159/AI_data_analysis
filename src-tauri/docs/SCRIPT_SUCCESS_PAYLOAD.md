# Scripted pipeline stdout contract (success)

This document is the **source of truth** for JSON printed to **stdout** when a pipeline script step completes successfully. The Rust `ScriptRunner` parses this payload and validates every path in `outputs` (existence, containment under `--output-dir`).

It applies to Python scripts under `src-tauri/scripts/` invoked by `adapter_step_contract` / `ScriptRunner` (for example `count_matrix_analysis.py`, `bulk_rna_matrix_analysis.py`).

## Success payload (stdout, single JSON object)

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `status` | string | yes | Must be `"ok"`. |
| `action` | string | yes | Must match the `--action` argument for this invocation (e.g. `normalize`, `model`). |
| `outputs` | array of strings | yes | Paths to files **created or updated** by this step. May be empty (e.g. validate-only steps). |

**Optional extra fields** (e.g. `summary` on validate) are allowed; the backend ignores unknown fields when parsing.

## Path rules for `outputs`

1. **Preferred form:** paths **relative to `--output-dir`**, using forward slashes (e.g. `normalized_matrix.tsv`, `plots/volcano.png`). In Python, build the list with `script_contract.relative_output_paths_for_json(output_dir, *absolute_paths)` so paths stay consistent and contained.
2. **Also accepted:** absolute paths, as long as they resolve **inside** the canonical `--output-dir` after validation (see Rust).
3. Each listed path must **exist on disk** after the script exits successfully.
4. Paths must not escape the run output directory (no `../` outside the tree, no symlinks resolving outside).

**stderr:** On failure, scripts print a separate JSON error payload to stderr and exit non-zero; that format is not described here.

## Rust implementation

- Parsing and validation: `src-tauri/src/services/script_runner.rs` (`ScriptSuccessPayload`, `validate_reported_outputs`).

## Adding a new scripted step

1. Implement the action; write artifacts under `--output-dir`.
2. Print exactly one JSON object on stdout with `status`, `action`, and `outputs` as above.
3. Prefer relative paths in `outputs` via `script_contract.relative_output_paths_for_json`.
4. Add or extend adapter tests that run the script end-to-end.
