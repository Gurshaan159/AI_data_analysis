# Architecture

## Core Principles

- Pipeline execution is deterministic after user approval.
- AI provides recommendation and guidance only.
- Frontend and backend boundaries are explicit.
- Pipeline families are registry-driven for easy extension.

## Frontend and Backend Communication

- Frontend calls Rust commands using Tauri `invoke`.
- Command wrappers live in `src/services/`.
- Rust command handlers live in `src-tauri/src/commands/`.
- Domain models are mirrored between TypeScript (`src/shared/types/`) and Rust (`src-tauri/src/shared/types.rs`).

## Frontend Layout

- `src/app/` app shell and page router
- `src/features/` page-level feature screens
- `src/components/` reusable UI components
- `src/state/` global state provider and reducer
- `src/services/` integrations (AI, execution, file picking, config, logging)
- `src/registry/` frontend pipeline registry

## Backend Layout

- `src-tauri/src/commands/` Tauri command entrypoints
- `src-tauri/src/services/` orchestration services (logging, config, path validation, command execution)
- `src-tauri/src/pipelines/` pipeline registry + future adapters
- `src-tauri/src/shared/` serialized domain structures

## AI Recommendation Strategy (Scaffold)

- Current: mocked recommendation service (`src/services/ai/recommendationService.ts`)
- Planned providers:
  - local rule-based recommendation
  - Lava API backed LLM recommendation
  - fallback literature/resource suggestions when unsupported

## Execution Strategy (Scaffold)

- `execution_manager` only returns placeholder run IDs.
- `command_runner` defines a reusable command execution abstraction.
- Future adapters in `src-tauri/src/pipelines/adapters.rs` should convert approved workflows into deterministic executable jobs.
