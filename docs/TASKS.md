# Foundation Tasks

## Completed Foundation Work

- [x] Tauri v2 + React + TypeScript + Vite initialization
- [x] Strict TypeScript config with path aliases
- [x] ESLint and Prettier setup
- [x] Rust lint/format readiness (`clippy`, `rustfmt`)
- [x] Frontend page skeleton for all required steps
- [x] App-level state model for workflow selection and approval
- [x] Frontend pipeline registry
- [x] Frontend AI recommendation and validation boundary
- [x] Rust command/services/pipeline module foundation
- [x] Python support directory for wrappers

## Deferred / Next Implementation Tasks

1. Implement real file/folder dialog command behavior in Rust.
2. Persist app settings through Rust-side config storage.
3. Build deterministic workflow runner pipeline by pipeline family.
4. Add registry validation to ensure pipeline definitions are consistent.
5. Implement Lava API recommendation provider and provider selection logic.
6. Add integration tests for invoke command contracts.
7. Add end-to-end tests for full workflow navigation and approval.

## Suggested Milestones

- Milestone 1: Local established pipeline execution (single family)
- Milestone 2: AI recommendation provider abstraction with mocks + rules
- Milestone 3: Multi-family registry and adapter expansion
- Milestone 4: Robust run logs, error handling, and reproducibility metadata
