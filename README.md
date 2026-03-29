# Biology Analysis Desktop Foundation

Scaffold for a desktop biology data analysis app with:

- deterministic workflow execution
- optional AI-assisted workflow recommendation (guidance only)
- local execution and user-selected output folders
- Tauri v2 + React + TypeScript + Rust architecture

No real bioinformatics tools are implemented yet. This is an extensible foundation for future pipeline families.

## Stack

- Tauri v2
- React + TypeScript + Vite
- Rust backend orchestration layer
- Node package tooling (`npm`)
- Python support folder for future wrapper scripts

## Quick Start

1. Install prerequisites:
   - Node.js
   - Rust toolchain ([tauri prerequisites](https://tauri.app/start/prerequisites/))
2. Install dependencies:
   - `npm install`
3. Copy env template:
   - `cp .env.example .env`
4. Run frontend dev server:
   - `npm run dev`
5. Run desktop app:
   - `npm run dev:tauri`

## Scripts

- `npm run dev` - Vite frontend dev server
- `npm run dev:tauri` - run full Tauri desktop app in development
- `npm run build` - strict TypeScript check + Vite production build
- `npm run preview` - preview Vite production build
- `npm run typecheck` - TypeScript type checks only
- `npm run lint` - TypeScript lint + Rust clippy checks
- `npm run lint:ts` - ESLint for frontend TypeScript
- `npm run lint:rust` - Rust clippy checks
- `npm run format` - Prettier + Rust fmt
- `npm run format:check` - check formatting without writing

## Environment Variables

- `VITE_AI_PROVIDER` - main AI provider selector (`mock` by default, switch to `lava` later without UI code changes)
- `VITE_LAVA_API_BASE_URL` - optional Lava endpoint base URL (used by Lava stub/config)
- `VITE_LAVA_API_KEY` - optional Lava API key placeholder for future integration

## Where To Extend

- Add frontend pipeline metadata in `src/registry/`
- Add Rust-side registry and execution adapters in `src-tauri/src/pipelines/`
- Add AI recommendation providers in `src/services/ai/`
- Add orchestration logic in `src-tauri/src/services/execution_manager.rs`
- Add Python wrappers in `python/adapters/`

See `docs/ARCHITECTURE.md`, `docs/FOLDER_STRUCTURE.md`, and `docs/TASKS.md` for implementation guidance.
