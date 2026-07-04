# Testing Plan

> **Standalone plan** — separate from `plans/refactor-plan/` (the security/quality audit). This folder holds all testing-related sub-plans for ColdJot: scaffolding, security regression tests, smoke/e2e, and CI.

## Read this first

- **[`01-testing-baseline.md`](./01-testing-baseline.md)** — the original testing-strategy plan (Vitest + RTL + Playwright + CI), moved here from `plans/refactor-plan/12-testing-strategy.md`.

## Relationship to the refactor-plan

This plan is **additive** — it does not fix a bug. It establishes test coverage for the security and quality fixes in `plans/refactor-plan/`. The baseline lands best **after** these refactor plans so the security fixes are testable:

- After `plans/refactor-plan/01` (IDOR), `03` (service auth), `05` (tracking) → write security regression tests.
- After `plans/refactor-plan/02b` (token encryption), `04` (zod validation), `09` (redaction) → unit-test the shared utilities.
- After `plans/refactor-plan/10` (BullMQ resilience) is smoke-verified → optional job-resilience tests.

## Sub-plans

| # | Plan | Status | Notes |
|---|---|---|---|
| [01](./01-testing-baseline.md) | Testing baseline (Vitest + Playwright + CI) | ⏸️ **Not started** | Originally `refactor-plan/12`. Scaffolding + security regression tests first. |

> More sub-plans may be added here over time (e.g. `02-e2e-critical-flow.md`, `03-ci-cleanup.md`).
