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

- `VITE_OPENAI_API_KEY` - OpenAI API key. The AI-assisted flow calls the **OpenAI Chat Completions API** directly (Bearer auth to `VITE_OPENAI_CHAT_COMPLETIONS_URL`). When this (or the legacy name below) is set, the app uses the OpenAI-backed planner by default.
- `VITE_LAVA_API_KEY` - **legacy alias** for `VITE_OPENAI_API_KEY` only (same direct OpenAI behavior; it does **not** call lava.so).
- `VITE_AI_PROVIDER` - optional: `mock` forces offline planning; `openai` / `lava` require a non-empty key as above.
- `VITE_OPENAI_CHAT_COMPLETIONS_URL` - optional; defaults to `https://api.openai.com/v1/chat/completions`. Legacy `VITE_LAVA_CHAT_COMPLETIONS_URL` is used if this is unset.
- `VITE_OPENAI_MODEL` - optional; defaults to `gpt-4o-mini`. Legacy `VITE_LAVA_MODEL` is used if this is unset.

## Where To Extend

- Add frontend pipeline metadata in `src/registry/`
- Add Rust-side registry and execution adapters in `src-tauri/src/pipelines/`
- Add AI recommendation providers in `src/services/ai/`
- Add orchestration logic in `src-tauri/src/services/execution_manager.rs`
- Add Python wrappers in `python/adapters/`

See `docs/ARCHITECTURE.md`, `docs/FOLDER_STRUCTURE.md`, and `docs/TASKS.md` for implementation guidance.
