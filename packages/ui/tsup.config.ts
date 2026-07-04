import { defineConfig } from "tsup";

/**
 * Build @coldjot/ui.
 *
 * - Each component stays its own entry point (entry glob) so consumers can
 *   tree-shake; we don't bundle into a single file.
 * - JSX is handled via the tsx loader (esbuild).
 * - All @radix-ui/* / react / next are peer deps → listed as external so they
 *   aren't bundled (each app brings its own copies; avoids double-React).
 * - CSS (src/styles.css) is NOT processed by tsup — it's consumed raw by apps
 *   via the "./styles.css" subpath export.
 */
export default defineConfig({
  clean: true,
  dts: false, // DTS via tsc --emitDeclarationOnly in a separate step if needed;
  // for now consumers pick up types from source via the "types" field above.
  entry: ["src/index.ts"],
  format: ["esm"],
  sourcemap: true,
  target: "es2022",
  treeshake: true,
  platform: "neutral",
  loader: { ".tsx": "tsx" },
  external: [
    "react",
    "react-dom",
    "react/jsx-runtime",
    "next",
    "next/navigation",
    "next/link",
    "@radix-ui/react-alert-dialog",
    "@radix-ui/react-avatar",
    "@radix-ui/react-checkbox",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-icons",
    "@radix-ui/react-label",
    "@radix-ui/react-popover",
    "@radix-ui/react-progress",
    "@radix-ui/react-radio-group",
    "@radix-ui/react-scroll-area",
    "@radix-ui/react-select",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-toast",
    "@radix-ui/react-toggle",
    "@radix-ui/react-toggle-group",
    "@radix-ui/react-tooltip",
    "class-variance-authority",
    "clsx",
    "cmdk",
    "lucide-react",
    "react-day-picker",
    "react-hook-form",
    "@hookform/resolvers",
    "react-resizable-panels",
    "recharts",
    "tailwind-merge",
    "vaul",
    "zod",
  ],
});
