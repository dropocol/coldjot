# accordion

2026-07-04. Strategy: transformation engine (legacy `new-york` style has no base counterpart). Verdict: migrated, typechecks clean.

## Changed

- `packages/ui/src/components/accordion.tsx` — rewired from `radix-ui` (unified Radix re-export) to `@base-ui/react/accordion`:
  - Import: `import { Accordion as AccordionPrimitive } from "radix-ui"` → `from "@base-ui/react/accordion"`
  - `Content` → `Panel` (base-ui naming). Exported name `AccordionContent` kept for consumer compatibility — it wraps `AccordionPrimitive.Panel` internally.
  - `data-[state=open]` → `data-[panel-open]` on the trigger's icon rotation selector (base-ui uses `data-panel-open` on Trigger).
  - `data-[state=closed]`/`data-[state=open]` on Panel → `data-[ending-style]`/`data-[starting-style]` (base-ui's animation lifecycle attributes).
- `packages/ui/src/styles/globals.css` — added `@keyframes accordion-down/up` overrides that reference `--accordion-panel-height` (Base UI's CSS var) instead of `--radix-accordion-content-height` (which tw-animate-css's built-in keyframes use). This keeps the `animate-accordion-down`/`animate-accordion-up` utility classes working with Base UI.
- `packages/ui/package.json` — `@base-ui/react@^1.6.0` added (npm auto-added during install).

Leftover scan: `grep -n "radix-ui\|@radix-ui" packages/ui/src/components/accordion.tsx` → clean (zero matches).

## Left alone

- All other `packages/ui/src/components/*.tsx` — still on `radix-ui` unified package. Progressive migration; only accordion was requested.
- `cmdk` (command), `vaul` (drawer), `sonner`, `react-day-picker` (calendar), `recharts` (chart) — intentionally untouched (not Radix, per hard rules).

## Behavior changes

- **Animation attributes differ.** Base UI uses `data-starting-style`/`data-ending-style` for enter/exit animation lifecycle instead of Radix's `data-state="open"`/`data-state="closed"`. The component's className selectors were updated accordingly. Visually equivalent.
- **CSS var renamed.** Base UI sets `--accordion-panel-height`; Radix set `--radix-accordion-content-height`. Keyframes overridden in globals.css to bridge this. Animations work identically.
- **Trigger open attribute.** Base UI uses `data-panel-open` on the Trigger; Radix used `data-state="open"`. The chevron rotation selector `[&[data-panel-open]>svg]:rotate-180` was updated.

## Verify by hand

- Click an accordion trigger → panel expands smoothly with height animation.
- Click again → panel collapses smoothly.
- Chevron icon rotates 180° when open, returns when closed.
- Keyboard: Tab to focus trigger, Enter/Space to toggle, Arrow Up/Down to move between items.
- Multiple items: only one open at a time (default `type="single"`).
