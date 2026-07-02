// Ambient declaration for side-effect CSS imports (e.g. `import "./globals.css"`).
// TS 6 tightened checking on side-effect imports of non-TS modules; without this,
// `import "./x.css"` fails with TS2882. Next's own types cover module CSS under
// some resolutions, but an explicit wildcard declaration is the robust fix.
declare module "*.css";
