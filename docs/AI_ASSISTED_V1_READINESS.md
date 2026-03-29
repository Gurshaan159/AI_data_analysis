# AI-Assisted v1 Readiness

## What AI v1 Supports

- **Bounded planning scope**: `count-matrix-analysis-v1` and `bulk-rna-matrix-downstream-v1` only.
- **Deterministic planning path**: intent extraction -> bounded planner/function catalog -> runtime+policy validation -> recommendation result.
- **Supported and unsupported UX flow**: centralized decision summaries, approval handoff for supported results, stable unsupported guidance.
- **Validation boundaries**: runtime schema guardrails and policy constraints are both enforced before UI consumption.
- **Developer observability**: structured planner decision traces via `ai.planner.decision_trace`.

## What AI v1 Intentionally Does Not Support Yet

- Open-ended workflow invention or autonomous expansion beyond bounded pipelines.
- Literature-grounded retrieval or citation-backed planning.
- Additional unsupported pipeline families (single-cell, spatial, alignment-first, etc.).
- Heavy end-to-end/browser automation beyond current lightweight smoke coverage.
- Advanced provider orchestration beyond current bounded provider interface.

## Extension Points for Future Work (v2+)

- **Function catalog**: `src/services/ai/planner/functionCatalog.ts`
  - Add new pipeline IDs and planner functions together.
- **Intent extraction**: `src/services/ai/intent/intentExtractor.ts`
  - Extend phrase detection and signal derivation for broader prompt understanding.
- **Policy validation**: `src/services/ai/planner/policyValidator.ts`
  - Tighten or expand allowed function/stage semantics for new planner behaviors.
- **Provider implementations**: `src/services/ai/providers/`
  - Improve transport/reasoning quality while preserving acceptance boundary.
- **Unsupported guidance/literature attachment point**: `src/services/ai/summary/decisionSummaryBuilder.ts`
  - Attach future literature-grounded resources to unsupported summaries without changing planner core contracts.
- **Pipeline mapping logic**: `src/services/ai/planner/plannerBoundary.ts`
  - Add new bounded mapping branches only with matching validator + summary updates.

## Freeze Notes

- v1 architecture is intentionally bounded; changes should be incremental and contract-safe.
- Keep planner, summary, and approval contracts stable unless a versioned migration is planned.
- Decision trace logs can be silenced with `AI_DECISION_TRACE=0` when needed for quieter runs.
