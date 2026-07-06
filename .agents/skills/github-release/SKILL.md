---
name: github-release
description: Create a GitHub release for this repo with auto-generated, properly grouped release notes built from commit history. Use whenever the user wants to cut/release/publish a release, draft release notes, tag a version, generate a changelog from commits, or says things like "create a release", "ship a release", "cut v0.x", "what changed since the last release", "publish to GitHub". Covers SemVer bumping from conventional commits and Keep-a-Changelog style notes via `gh release create`.
---

# github-release

Create a GitHub release (tag + notes) for this repo from git history, using the `gh` CLI. The model **drafts** notes from commits, the user **approves**, then the release is created.

## Inputs

Ask the user (only if not already obvious from the turn):

1. **Version** — one of:
   - Explicit: `v0.2.0`.
   - `auto` (default) — compute SemVer bump from commits since the last tag (rules below).
2. **Scope** — `auto` (default): commits since the last `v*` tag, or all reachable from HEAD if there is no prior tag (first release). Or an explicit ref: `v0.1.0`, `<sha>`.

Everything else (notes content, target, latest/pre-release flags) the model derives. Don't over-prompt.

## Workflow

### 1. Collect commits

Run the helper script from the repo root. It prints metadata, then one TSV line per commit (`sha<TAB>subject<TAB>breaking`).

```bash
.agents/skills/github-release/scripts/collect-commits.sh
```

To pass an explicit since-ref (overrides last-tag auto-detection):

```bash
.agents/skills/github-release/scripts/collect-commits.sh v0.1.0
```

If `gh` is not authenticated or the repo has no `origin` remote, stop and tell the user — don't try to fix auth yourself.

### 2. Compute the SemVer bump (when version = auto)

Bump level is decided from the commit list, **highest level wins**:

| Signal | Level |
|---|---|
| Any commit with a breaking change (header `!:` **or** `BREAKING CHANGE:` footer) | **major** |
| Any `feat:` / `feature:` (any scope) | **minor** |
| Otherwise | **patch** |

Rules:
- Start from the last tag's version, or `v0.0.0` if no prior tag exists.
- First release ever: default to `v0.1.0` (don't ship `v0.0.1`).
- Pre-1.0 (`v0.x.y`): a breaking change bumps the **minor** (not major) — i.e. `0.x` behaves like SemVer's pre-1.0 convention. State this when you do it.
- Strip a leading `v` for arithmetic, re-add it for the tag.

Show the math briefly so the user can sanity-check: `last tag v0.1.0 → feat present → minor bump → v0.2.0`.

### 3. Group commits into Keep-a-Changelog sections

Classify each commit by its **subject prefix** (Conventional Commits). This repo's commits mix strict Conventional (`docs(plans):`) with a custom `phase X.Y:` / `merge:` style — handle both.

| Subject pattern | Section |
|---|---|
| `feat(...)?:` / `feature:` | ✨ Features |
| `fix(...)?:` | 🐛 Bug Fixes |
| `perf(...)?:` | ⚡ Performance |
| `refactor(...)?:` | ♻️ Refactor |
| `revert:` | ↩️ Reverts |
| `docs(...)?:` | 📝 Documentation |
| `test(...)?:` | 🧪 Tests |
| `build(...)?:`, `ci(...)?:`, `chore(...)?:` | 🧹 Chores |
| `merge:` / `phase X.Y:` / `subplan:` | 🚧 Internal / Refactor Progress |
| anything else | 📦 Other |

Rules:
- **Drop merge commits from the per-commit list** only if their changes are already represented by squashed children in the range. If the merge brings in a phase/milestone, keep it as a single line under 🚧 Internal and skip its children.
- Include the short SHA for every line: `- launch-sequence service (\`62d2fec\`)`.
- If a commit has a `BREAKING CHANGE:` footer, surface its description under a **⚠️ BREAKING CHANGES** section at the top, and reference the SHA.
- Skip pure noise (`merge` bot commits, formatting-only `chore: format`). When in doubt, keep it.

### 4. Render the notes

Assemble markdown in this order:

```
## ⚠️ BREAKING CHANGES        (only if any)
- <change> — see <sha>

## ✨ Features
- ...

## 🐛 Bug Fixes
- ...

## ♻️ Refactor
- ...

## 📝 Documentation
- ...

## 🚧 Internal / Refactor Progress
- ...

## 🧹 Chores
- ...

**Full changelog:** https://github.com/<owner>/<repo>/compare/<prev>...<new>
```

Omit any empty section. Always include the **Full changelog** link when a previous tag exists.

### 5. Confirm with the user — DO NOT skip

Show the user, in one message:

1. The proposed **tag** (e.g. `v0.2.0`) and how it was derived.
2. The **target**: the current HEAD of the default branch (or another branch if the user asked). Show `HEAD_SHA`.
3. Whether it's **latest** (default yes) / **prerelease** (default no).
4. The full rendered notes.

Then stop and wait for explicit go-ahead. Do not call `gh release create` until the user confirms. If they want edits, edit and re-show. Only after "yes"/"go"/"ship it" do you create the release.

### 6. Create the release

```bash
gh release create <tag> \
  --target <branch-or-sha> \
  --title "<tag>" \
  --notes-file <path-to-notes-md> \
  [--latest] [--prerelease]
```

Prefer `--notes-file` over `--notes` so multi-line markdown survives verbatim. Write the notes to a temp file (e.g. `$(mktemp -t release_notes).md`), pass it, then delete it.

Do **not** push the tag separately — `gh release create` tags `--target` for you.

After creation, print the release URL `gh` returns so the user can open it.

## Defaults summary

- Version: `auto` (SemVer from commits).
- Scope: since last `v*` tag, or full history for the first release.
- latest: yes (unless a `v0.0.0-`/`-rc`/`-beta` suffix is present, then prerelease).
- Target: HEAD of current branch.
- Always confirm before creating.
- Never amend history or force-push as part of a release.

## Examples

### Example: first release, no prior tags

> User: "cut the first release"

1. Run `collect-commits.sh` → `LAST_TAG=` (empty), `RANGE=HEAD`, all reachable commits.
2. First release → `v0.1.0`.
3. Group commits; no "Full changelog" link (no previous tag).
4. Show notes + tag, confirm.
5. `gh release create v0.1.0 --target master --title v0.1.0 --notes-file …`.

### Example: subsequent release

> User: "release v0.2.0"

1. `LAST_TAG=v0.1.0`, range `v0.1.0..HEAD`.
2. User gave explicit tag → skip bump math.
3. Group, render with `**Full changelog:** …/compare/v0.1.0...v0.2.0`.
4. Confirm, then create.
