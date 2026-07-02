# Step 3 — `upgrade/tailwind-4` (apps/web only)

> Branch: `upgrade/tailwind-4` off the merged `upgrade/eslint-10`.
> Bump tailwindcss 3.4 → 4.3.2 (latest). v4 is **CSS-first** — JS config moves into CSS `@theme`.

## Goal
Modernize the web app to Tailwind v4 while **preserving the shadcn/ui token theme exactly** (every component depends on the `hsl(var(--…))` CSS variables).

## Bumps
- `apps/web/package.json`:
  - `tailwindcss` `^3.4.1` → `^4.3.2`
  - **add** `@tailwindcss/postcss` `^4.3.2` (the v4 PostCSS plugin; replaces the bare `tailwindcss` PostCSS entry + autoprefixer)
  - `tailwind-merge` `^2.6.0` → `^3.6.0` (v4-compatible)
  - `@tailwindcss/typography` `^0.5.15` → latest `^0.5.x` (verify v4 compat at exec; if incompatible, evaluate alternatives)
  - `tailwindcss-animate` `^1.0.7` → keep, but verify v4 compat; if broken, switch to `tw-animate-css` (the community v4 successor)
  - `postcss` `^8` → keep (still needed as the PostCSS runner)

## Migration approach
**Run the official codemod first, then hand-fix.** The codemod (`npx @tailwindcss/upgrade`) handles the bulk of utility renames and config translation automatically.

### 1. `apps/web/postcss.config.mjs`
Before:
```js
plugins: { tailwindcss: {} }
```
After (v4):
```js
plugins: { "@tailwindcss/postcss": {} }
```

### 2. `apps/web/src/app/globals.css`
- `@tailwind base; @tailwind components; @tailwind utilities;` → `@import "tailwindcss";`
- The shadcn `:root` / `.dark` HSL variable blocks (`--background`, `--foreground`, `--primary`, …, `--radius`) **stay as-is** — they're plain CSS custom properties, fully v4-compatible.
- The `@layer base` / `@layer components` blocks with `@apply` (e.g. `@apply border-border bg-background text-foreground`) **stay** — `@apply` is still supported in v4. Verify each `@apply`'s utility still exists (some v3 utilities were renamed — the codemod flags these).
- Custom variant for dark mode: add `@custom-variant dark (&:is(.dark *));` so `dark:` utilities respond to the `.dark` class (v4 defaults to `prefers-color-scheme`; the shadcn setup uses class strategy).

### 3. `apps/web/tailwind.config.ts` → CSS `@theme`
v4 is CSS-first, so the JS config is **retired** (or kept as a thin compatibility shim). Migrate each setting into `@theme` in `globals.css`:
- `darkMode: ["class"]` → the `@custom-variant` above.
- `content: ["./src/**/*.{js,ts,jsx,tsx}"]` → v4 auto-detects sources; set explicit `@source` if auto-detection misses anything.
- `theme.extend.colors` (the shadcn `border`/`input`/`ring`/`background`/`foreground`/`primary`/`secondary`/`destructive`/`muted`/`accent`/`popover`/`card` tokens, each `hsl(var(--…))`) → `@theme { --color-border: hsl(var(--border)); ... }`.
- `theme.container` (`{ center: true, padding: "2rem", screens: { "2xl": "1400px" } }`) → `@theme { --container-center: true; ... }` or keep as a small `tailwind.config.ts` shim (v4 still reads a JS config for non-theme keys).
- `theme.extend.borderRadius` (`lg`/`md`/`sm` → `--radius` token) → `@theme { --radius-lg: var(--radius); ... }`.
- `theme.extend.keyframes` + `animation` (`accordion-down`, `accordion-up`) → `@theme { --animate-accordion-down: accordion-down 0.2s ease-out; @keyframes accordion-down { ... } }`.
- `plugins: [@tailwindcss/typography, tailwindcss-animate]` → loaded via `@plugin` in CSS: `@plugin "@tailwindcss/typography";` (if v4-compatible).

> **Decision point at exec:** Whether to fully retire `tailwind.config.ts` or keep it as a shim. The cleanest v4 setup is CSS-only; I'll aim for that but keep the JS config if a setting resists translation.

## Verification
1. `npm install` succeeds.
2. `npm run build` succeeds — **Next must compile the new CSS**. This is where most v4 issues surface (unknown utilities, missing `@source`).
3. `npm run lint` passes.
4. **Runtime visual smoke (the most important verification for this step):**
   - Load the app in **light mode** and **dark mode** — verify colors render correctly (the #1 reported v4 migration break is broken dark mode).
   - Check `border-radius` (cards, buttons), the accordion animation (`accordion-down`/`accordion-up`), and prose/typography (`@tailwindcss/typography`) on a content-heavy page.
   - Spot-check `container` centering + padding.
   - If anything looks wrong, diff the compiled CSS (`next build` emits it) against the pre-upgrade output.

## Risks & rollback
- **Dark mode breakage** is the top-reported v4 issue — mitigated by the explicit `@custom-variant dark` above.
- **Missing defaults** (v4 dropped some v3 default utilities) — the codemod flags most; fix the remainder.
- **Plugin incompatibility** (`@tailwindcss/typography`, `tailwindcss-animate`) — verify before committing; have `tw-animate-css` ready as a fallback.
- Rollback: revert the commit; restore `tailwind.config.ts` + `postcss.config.mjs` + `globals.css` from git; `npm install`.
