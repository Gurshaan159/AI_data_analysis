# Folder Structure

```text
.
├── docs/                         # Architecture and implementation guidance
├── python/                       # Future Python wrappers for pipelines
├── src/                          # Frontend (React + TypeScript)
│   ├── app/                      # App shell and page routing
│   ├── components/               # Reusable UI components
│   ├── config/                   # Frontend environment/config utilities
│   ├── features/                 # Page-level feature modules
│   ├── models/                   # UI-facing derived models (workflow diagrams)
│   ├── registry/                 # Frontend pipeline registry definitions
│   ├── services/                 # Integration services (AI, execution, files, logging, settings)
│   ├── shared/                   # Shared frontend type definitions
│   ├── state/                    # Global app state scaffold
│   └── styles/                   # Minimal global and app styles
├── src-tauri/                    # Rust backend/orchestration
│   └── src/
│       ├── commands/             # Tauri command handlers
│       ├── pipelines/            # Pipeline registry and adapters
│       ├── services/             # Core backend services
│       ├── shared/               # Serializable backend shared types
│       ├── error.rs              # Shared app error model
│       ├── lib.rs                # Tauri app setup + command wiring
│       └── main.rs               # Binary entrypoint
└── tests/
    ├── backend/                  # Future backend tests
    └── frontend/                 # Future frontend tests
```

## Where to Add New Pipelines

- Frontend registry entries: `src/registry/pipelineRegistry.ts`
- Backend registry entries: `src-tauri/src/pipelines/registry.rs`
- Execution adapters: `src-tauri/src/pipelines/adapters.rs`

## Where to Add AI Logic

- Frontend recommendation orchestrator: `src/services/ai/recommendationService.ts`
- Backend AI command/services can be added under `src-tauri/src/services/` if needed later.

## Where to Add Execution Logic

- Deterministic workflow run coordination: `src-tauri/src/services/execution_manager.rs`
- External tool/process invocation abstraction: `src-tauri/src/services/command_runner.rs`
