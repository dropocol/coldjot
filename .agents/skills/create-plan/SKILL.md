---
name: create-plan
description: >-
  Generate a structured suite of plan markdown files (README + STATUS + one
  sub-plan per file-group) for an implementation task. Use whenever the user
  asks to "create a plan", "write a plan", "plan this feature", "break this
  down into steps", "draft an implementation plan", or invokes /create-plan.
  Produces real plan FILES under plans/<slug>/ — distinct from ZCode's
  built-in plan mode. Always explore the codebase first so the plan is
  grounded in actual file:line references, not guesses.
---

# Skill: create-plan

Turn a feature idea into a structured, self-contained plan suite: a folder of markdown docs under `plans/<plan-slug>/` that an implementing agent (or engineer) can execute top-to-bottom without further questions.

## Output layout

```
plans/<plan-slug>/
├── README.md       ← the main plan (problem, goal, design, touch-map, order)
├── STATUS.md       ← the status tracker (table, deps, checklists, changelog)
└── 01-<area>.md, 02-<area>.md, ...   ← sub-plans, one per file-group
```

Sub-plans are numbered in dependency order: foundation layers first (db → types → backend → frontend). Each is independently committable.

## The 5-step procedure (do all of them, in order)

### 1. Explore the codebase FIRST — do not skip

A plan with guessed file references is useless. Before writing a single plan line, explore the actual repo. Use the Explore/Agent subagent tool to investigate these areas **in parallel** (one subagent per area):

- **Schema / data layer** — find the ORM schema, models, migrations, domain extensions. Note exact model names and line numbers.
- **Backend / API layer** — route handlers, controllers, validation, auth/IDOR guards. Note the handler convention (auth → parseBody → query → respond).
- **Frontend layer** — components, hooks/queries, query-key factories, HTTP client. Note existing patterns to mirror.
- **Conventions** — naming, file structure, test setup, the command that typechecks/lints/builds.
- **Existing patterns to reuse** — find the closest precedent for what's being built (a similar feature is the single best source of truth for style).

Collect concrete `path:line` references for every claim the plan will make. If you can't find something, say so in the plan ("convention unclear — confirm before implementing") rather than inventing a path.

> Why parallel subagents: exploration is the slowest step and the areas are independent. Spawning 3-4 Explore agents in parallel cuts wall-clock time and avoids serial round-trips.

### 2. Decompose into sub-plans by file-group

Group the work so that each sub-plan:

- touches a **coherent set of related files** (one layer or one feature area),
- is **independently committable** (lands green on its own, doesn't half-build a feature),
- respects **dependency order** — foundation first. Typical order for a full-stack feature:

  1. database (schema + migration + domain extensions)
  2. types (shared Zod schemas / DTOs — tiny, unblocks everything)
  3. backend API (routes, guards, business logic)
  4. frontend hooks (react-query mutations / data fetching)
  5. frontend UI (components, dialogs, pages)
  6. cross-service / jobs / cron (defensive hardening, often last)

  Not every plan needs all six — drop layers that don't apply. A UI-only plan might just be `01-components.md`, `02-styles.md`.

### 3. Derive the plan slug

Slugify the topic into kebab-case for the folder name: `Bulk Contact Delete` → `bulk-contact-delete`, "add CSV import" → `csv-import`. Short, lowercase, hyphenated, descriptive. Reuse the user's own wording when reasonable.

### 4. Write the plan files

Create `plans/<plan-slug>/` and write the three file types using the templates in [`references/templates.md`](./references/templates.md) — read that file now, it has the README / STATUS / sub-plan skeletons with the exact headings, tables, and section order to follow. The templates are derived from real, production-quality plans; mirror their structure.

Cross-link everything: README links to each sub-plan and STATUS; STATUS links to each sub-plan; each sub-plan links back to README and declares its dependencies.

### 5. Report and STOP

After writing the files, tell the user:

- the path to the plan folder,
- the list of sub-plans in dependency order,
- the recommended implementation order (which to land first),
- any unknowns you couldn't resolve during exploration (flag them explicitly).

**Do not commit the plan files.** `plans/` is gitignored in this repo (plans are local working docs). Do not create a git branch unless the user explicitly asks for implementation to start now — planning and implementing are separate steps. If they want to proceed to implementation, they'll say so.

## Style rules (apply to every file you write)

These come straight from the reference plans the user keeps reusing. Bake them in:

- **Terse, imperative prose.** "Add `deletedAt: null` to the `where`." Not "You might want to consider adding…". Short sentences. No filler.
- **Every file reference is `path:line`.** Never write "the contact route" — write `` `apps/web/src/app/api/contacts/[id]/route.ts:137-167` ``. If you reference a symbol, give the file and line where it's defined. This is the single most important rule — it's what makes a plan executable.
- **Show the code, don't describe it.** Sub-plan steps include a fenced code block showing the before/after or the final shape. A reader should be able to copy the block.
- **Tables for structured data.** Files-touched, "what already exists (reuse)", FK/dependency reality, acceptance criteria, status — all tables. Scannable beats paragraphy.
- **Imperative headings in steps.** `## Step 1 — Schema edit`, `## Step 2 — Generate the migration`. Numbered, action-first.
- **Explain the "why" for non-obvious decisions.** If you reject an obvious approach, say why in one line. (The reference README's "why the migration is trivial" section is the gold standard.)
- **Acceptance criteria as a checklist.** `- [ ]` items, each independently verifiable (`turbo run typecheck` green, column exists, index exists, route returns 403 for foreign id).
- **Risks/gotchas section** at the end of every sub-plan — the footguns, drift risks, "don't forget to regenerate" warnings.
- **Explicit non-goals.** The README lists what's deliberately OUT of scope, so the implementer doesn't gold-plate.
- **Branch note + gitignore note.** Every file's header blocknotes the working branch and that `plans/` is gitignored.

## What NOT to do

- **Don't enter ZCode plan mode (EnterPlanMode).** This skill writes markdown plan *files*. Plan mode is a different feature. They are not the same thing.
- **Don't commit the plan files.** `plans/` is gitignored. Leave them on disk.
- **Don't skip exploration.** A plan full of `path:line` references you made up is worse than no plan — it sends the implementer to nonexistent files. If exploration is blocked, write the plan but clearly mark every unverified reference as "⚠️ verify path".
- **Don't write one giant README.** Decompose. The README is the map; sub-plans are the territory. If a section grows past ~150 lines, it belongs in a sub-plan.
- **Don't prescribe line numbers you'll be wrong about.** Reference *current* line numbers from your exploration, and phrase step instructions by symbol/intent ("the `prisma.contact.findMany` call in the GET list handler") so they survive minor edits.

## Worked examples

Two real examples live in this repo and are the canonical style reference — read them if you need to calibrate tone, depth, or structure:

- **`plans/bulk-contact-delete/`** — a full-stack feature (soft-delete + hard-delete). 6 sub-plans spanning db → types → backend → hooks → UI → cross-service. The cleanest end-to-end example: see its `README.md` (design decision + reuse table + touch-map), `STATUS.md` (dependency graph + per-sub-plan verification checklists), and `01-database.md` / `03-backend-api.md` (sub-plan format with before/after code blocks).
- **`plans/refactor-plan/`** — a large multi-area refactor. `STATUS.md` there shows the at-a-glance table scaled to 13+ plans with commit hashes, and `13-monorepo-scripts-devexperience.md` shows a single-area sub-plan with a deep "Problem" breakdown. Use this as the precedent when the plan is wide rather than deep.

When in doubt about format, open the `bulk-contact-delete` example and mirror its section order and table shapes exactly.

## Quick reference — the three file types

| File | Purpose | Key sections |
|---|---|---|
| `README.md` | The main plan — the map | Problem · Goal · Design decisions (with rationale) · "What already exists (reuse)" table · File touch-map · Implementation order · Out-of-scope non-goals · Links to sub-plans |
| `STATUS.md` | The tracker | At-a-glance table (status emojis) · Dependency graph (ASCII) · Per-sub-plan verification checklist · Follow-ups tracker · Changelog |
| `NN-<area>.md` | One sub-plan per file-group | Files table · Context · Numbered Steps with code blocks · Acceptance criteria checklist · Risks/gotchas |

Status emoji legend (use in STATUS.md): ⬜ Not started · 🟡 In progress · 🟢 Code done (needs verify) · ✅ Done/verified · ⛔ Blocked

---

**Read [`references/templates.md`](./references/templates.md) before writing the files** — it contains the copy-adaptable README, STATUS, and sub-plan skeletons with placeholder tokens (`{{PLAN_TITLE}}`, `{{SLUG}}`, `{{BRANCH}}`, `{{AREA}}`, etc.) that you fill in from your exploration.
