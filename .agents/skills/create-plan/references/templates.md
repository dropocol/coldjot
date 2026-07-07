# Plan-file templates

Copy-adaptable skeletons for the three file types. Fill the `{{TOKENS}}` from your codebase exploration. Delete sections that don't apply to the plan at hand — don't leave empty headings.

Legend of tokens:

- `{{PLAN_TITLE}}` — human title, e.g. "Bulk Contact Delete (Soft-Delete + Hard-Delete)"
- `{{SLUG}}` — kebab-case folder name, e.g. `bulk-contact-delete`
- `{{BRANCH}}` — working branch, e.g. `features/bulk-contact-delete`
- `{{ONE_LINE_SCOPE}}` — one sentence describing what the plan delivers
- `{{AREA}}` — sub-plan area name, e.g. `database`, `backend-api`, `frontend-ui`

---

## 1. README.md (the main plan)

````markdown
# Plan — {{PLAN_TITLE}}

> **Audience:** an implementing model/engineer. Self-contained.
> **Branch:** `{{BRANCH}}`
> **Scope:** {{ONE_LINE_SCOPE}}.
> **Note:** `plans/` is gitignored — these docs stay local, never committed.

---

## Problem

Today:

- {{pain point 1, with `path:line` to the current code}}
- {{pain point 2}}
- {{why the current state is broken / fragile / missing}}

## Goal (end state)

1. **{{outcome 1 — imperative, verifiable}}.** {{one line of detail}}.
2. **{{outcome 2}}.** {{detail}}.
3. **{{outcome 3}}.** {{detail}}.
4. **{{migration/deploy is trivial + safe}}** — {{one line on why it's low-risk: additive, reversible, no backfill}}.

## Key design decision — {{the non-obvious choice}}

{{The crux. State the chosen approach and explicitly reject the obvious-but-wrong alternative in 2-4 lines. Explain WHY. This is the section an implementer will re-read.}}

- **(Rejected) {{obvious approach}}** → {{why it's bad: forces X, breaks Y, drifts Z}}.
- **(Chosen) {{your approach}}** → {{why it wins: additive, auditable, matches existing pattern}}.

## What already exists (reuse, don't rebuild)

| Capability | Where | Notes |
|---|---|---|
| {{capability}} | `path:line` | {{what to mirror / reuse}} |
| {{capability}} | `path:line` | {{notes}} |

## {{domain reality — e.g. "Foreign-key reality" / "Dependency reality"}}

{{A table capturing the structural facts the plan hinges on. For a DB change, list tables + onDelete policies. For a refactor, list callers + coupling. This grounds the design.}}

| {{entity}} | {{attribute}} | {{behavior today}} | {{behavior after}} |
|---|---|---|---|
| {{...}} | {{...}} | {{...}} | {{...}} |

## File touch-map (overview — details in sub-plans)

```
{{top-level dir}}/
├── {{path}}               [NN] {{one-line change}}
├── {{path}}               [NN] {{one-line change}}
└── {{path}}               [NN] {{one-line change}}

{{next dir}}/
└── {{path}}               [NN] {{one-line change}}
```

## Implementation order (committable steps)

Work bottom-up so each layer compiles independently:

1. **[01-{{area}}]** {{what + why it's first}}.
2. **[02-{{area}}]** {{what}}.
3. **[03-{{area}}]** {{what}}.
...

Each sub-plan is independently committable. Steps N+ can proceed in parallel once the foundation lands.

## Out of scope (explicit non-goals)

- {{thing deliberately not covered, and why}}.
- {{deferred hardening}}.
- {{related-but-separate feature}}.

## Sub-plans

- [01 — {{area}}: {{subtitle}}](./01-{{area}}.md)
- [02 — {{area}}: {{subtitle}}](./02-{{area}}.md)
- ...

Status tracker: [STATUS.md](./STATUS.md).
````

---

## 2. STATUS.md (the tracker)

````markdown
# {{PLAN_TITLE}} — Status

> **Branch:** `{{BRANCH}}`
> **Plan root:** [`README.md`](./README.md)
> **Legend:** ⬜ Not started · 🟡 In progress · 🟢 Code done (needs verify) · ✅ Done/verified · ⛔ Blocked
> **`plans/` is gitignored** — this file is a local working tracker, never committed.

---

## At-a-glance

| # | Sub-plan | Status | Owner | Commit | Notes |
|---|---|---|---|---|---|
| [01](./01-{{area}}.md) | {{area}} — {{subtitle}} | ⬜ | | | {{why it's foundational}} |
| [02](./02-{{area}}.md) | {{area}} — {{subtitle}} | ⬜ | | | {{unblocks what}} |
| ... | | | | | |

**Totals:** 0 done · 0 in progress · N not started.

---

## Dependency order

```
01 ({{area}}) ──▶ 02 ({{area}}) ──▶ 03 ({{area}}) ──┬─▶ 04 ──▶ 05
                                                     └─▶ 06
```

- **01 blocks everything** ({{reason}}).
- **02 blocks 03** ({{reason}}).
- {{...}}

Recommended commit cadence: one commit per sub-plan, in dependency order. Each commit should leave the build green (`{{typecheck/lint command}}`).

---

## Verification checklist (per sub-plan, copy into the commit body)

### 01-{{area}}
- [ ] {{verifiable assertion, e.g. "schema has the new column + index"}}.
- [ ] {{migration folder exists with exactly N statements}}.
- [ ] {{`prisma migrate diff` / equivalent matches hand-written SQL}}.
- [ ] {{deploy + generate run clean}}.
- [ ] {{typecheck green}}.

### 02-{{area}}
- [ ] {{assertion}}.
- [ ] {{assertion}}.

### 03-{{area}}
- [ ] {{assertion}}.
- [ ] {{assertion}}.

---

## End-to-end smoke test (run after all sub-plans land)

Manual, against local dev environment:

1. **{{scenario}}:** {{steps}} → {{expected}}.
2. **{{scenario}}:** {{steps}} → {{expected}}.
3. **{{edge case / security}}:** {{steps}} → {{expected (e.g. 403)}}.

---

## Follow-ups (explicitly out of scope — track here so they're not forgotten)

- [ ] {{future hardening}}.
- [ ] {{related feature}}.
- [ ] {{tech debt surfaced during planning}}.

---

## Changelog

| Date | Change |
|---|---|
| {{YYYY-MM-DD}} | Plan suite created on `{{BRANCH}}`. |
````

---

## 3. NN-<area>.md (a sub-plan)

````markdown
# Sub-plan 0N — {{Area}}: {{subtitle}}

> {{one-line role of this sub-plan in the whole}}. {{"Land this first" if foundational}}.
> Branch: `{{BRANCH}}`. {{Depends on: [0X-{{area}}](./0X-{{area}}.md).}}

---

## Files

| File | Change |
|---|---|
| `{{path:line}}` | {{imperative description of the change}}. |
| `{{path:line}}` | {{description}}. |
| `{{path}}` | **NEW** — {{what it is}}. |

## Context

{{2-4 sentences grounding the reader. What's here today, what conventions apply, what the closest precedent is. Reference `path:line`.}}

The relevant existing code (`{{path:line}}`):

```{{lang}}
// existing
{{code showing current state}}
```

{{Named the convention to follow, with `path:line` to the canonical example:}}

```{{lang}}
const authResult = await requireAuth();              // lib/auth/access.ts:15
if (isAuthError(authResult)) return authResult;
const body = await parseBody(request, someSchema);    // lib/http/validation.ts:20
```

---

## Step 1 — {{imperative action}}

{{Why + what.}} In `{{path:line}}`, find {{symbol}} and change:

```{{lang}}
// before
{{current code}}

// after
{{changed code}}
```

## Step 2 — {{imperative action}}

{{Detail. Include a fenced block showing the final shape.}}

```{{lang}}
{{code}}
```

> **{{Gotcha / why this way}}:** {{one-line rationale for a non-obvious choice}}.

## Step 3 — {{imperative action}}

{{... continue for as many steps as the sub-plan needs. Keep each step small and copy-pasteable.}}

---

## Acceptance criteria

- [ ] {{verifiable assertion}}.
- [ ] {{verifiable assertion}}.
- [ ] {{command runs clean, e.g. `turbo run typecheck` green}}.

## Risks / gotchas

- **{{risk}}.** {{mitigation}}.
- **{{footgun}}.** {{what to do instead}}.
````

---

## Filling the tokens — quick guidance

- **`{{BRANCH}}`**: ask the user, or infer `features/<slug>` / `feat/<slug>`. Note it but don't create it.
- **Line numbers**: pull them fresh from your exploration in step 1. Prefer **ranges** (`:137-167`) for multi-line symbols.
- **Reuse table**: this is where exploration pays off. Every row should be a concrete existing capability with a `path:line` — it tells the implementer "don't rebuild this, mirror it."
- **Dependency graph (ASCII)**: keep it simple and accurate. Boxes are sub-plans; arrows are "must land before." If a sub-plan is parallelizable, show it branching.
- **Status**: every sub-plan starts at ⬜ Not started. The implementer updates STATUS.md as they go — your job is the empty tracker, correctly wired.
