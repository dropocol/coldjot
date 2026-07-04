/*
 * Codemod: convert `<XTrigger asChild>` (Radix-style) to Base UI's `render` prop.
 *
 * Background
 * ----------
 * In Radix, `<TooltipTrigger asChild><Button/></TooltipTrigger>` renders a SINGLE
 * element: the Slot replaces the trigger's own tag with the child. In Base UI the
 * equivalent is the `render` prop — `asChild` is not honored the same way, so the
 * trigger keeps rendering its default `<button>` AND your `<Button>` renders another
 * `<button>` inside it. That produces invalid HTML (`<button>` inside `<button>`)
 * and a React hydration error.
 *
 * What this script does
 * ---------------------
 * For every JSX element whose tag is one of the Base UI "trigger" components and
 * that has `asChild` set, IF it has exactly one JSX child element, it rewrites:
 *
 *   <TooltipTrigger asChild>
 *     <Button variant="outline" onClick={...}>Save</Button>
 *   </TooltipTrigger>
 *
 * into:
 *
 *   <TooltipTrigger render={<Button variant="outline" onClick={...} />}>
 *     Save
 *   </TooltipTrigger>
 *
 * Nested triggers (e.g. DialogTrigger > TooltipTrigger > Button) are handled
 * naturally: each `asChild` trigger is transformed independently on its own pass.
 *
 * Safety
 * ------
 * - Only touches elements with `asChild` whose single child is a JSX element.
 * - Children of the inner element (JSX text / expressions / elements) are moved
 *   out to become the trigger's children.
 * - If the inner element has no children, the trigger ends up with no children.
 * - `nativeButton={false}` is NOT added; only relevant when the rendered element
 *   is a non-button, and Base UI defaults are correct for our Button/Link cases.
 *
 * Usage
 * -----
 *   npx tsx scripts/fix-aschild-triggers.ts            # write
 *   npx tsx scripts/fix-aschild-triggers.ts --dry-run  # preview only
 *   npx tsx scripts/fix-aschild-triggers.ts --path apps/web/src/components/layout
 */

import { Project, Node, SyntaxKind } from "ts-morph";
import type * as tm from "ts-morph";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");

// Trigger component names that render a `<button>` (or other element) by default
// in Base UI and therefore must use `render` instead of `asChild`.
const TRIGGER_NAMES = new Set([
  "TooltipTrigger",
  "DropdownMenuTrigger",
  "MenuTrigger",
  "DialogTrigger",
  "AlertDialogTrigger",
  "PopoverTrigger",
  "HoverCardTrigger",
  "ContextMenuTrigger",
  "SelectTrigger",
  "CollapsibleTrigger",
  "AccordionTrigger",
  "TabsTrigger",
  "ToggleTrigger",
  "NavigationMenuTrigger",
  "PreviewCardTrigger",
  "ComboboxTrigger",
  "AutocompleteTrigger",
]);

type Mode = "write" | "dry-run";
const mode: Mode = process.argv.includes("--dry-run") ? "dry-run" : "write";

const customPathIdx = process.argv.indexOf("--path");
const targetGlob =
  customPathIdx !== -1 && process.argv[customPathIdx + 1]
    ? process.argv[customPathIdx + 1]!
    : "apps/web/src/**/*.{ts,tsx}";

interface FileResult {
  file: string;
  transformed: number;
}

function isTriggerElement(node: Node): node is tm.JsxOpeningElement | tm.JsxSelfClosingElement {
  if (!Node.isJsxOpeningElement(node) && !Node.isJsxSelfClosingElement(node)) {
    return false;
  }
  const tag = node.getTagNameNode();
  const name = tag.getText();
  // Support member expressions like <Menu.Trigger> as well as bare <DropdownMenuTrigger>.
  const last = name.split(".").pop() ?? name;
  return TRIGGER_NAMES.has(last) || TRIGGER_NAMES.has(name);
}

function attrExists(
  element: tm.JsxOpeningElement | tm.JsxSelfClosingElement,
  name: string,
): boolean {
  return element.getAttributes().some((attr) => {
    if (attr.getKind() !== SyntaxKind.JsxAttribute) return false;
    return (attr as tm.JsxAttribute).getNameNode().getText() === name;
  });
}

function removeAsChildAttribute(
  element: tm.JsxOpeningElement | tm.JsxSelfClosingElement,
): void {
  for (const attr of element.getAttributes()) {
    if (attr.getKind() === SyntaxKind.JsxAttribute && (attr as tm.JsxAttribute).getNameNode().getText() === "asChild") {
      attr.remove();
      break;
    }
  }
}

function getSingleJsxChildElement(
  parent: tm.JsxElement,
): tm.JsxElement | tm.JsxSelfClosingElement | null {
  // Collect meaningful child nodes (skip pure whitespace JSX text).
  const children = parent
    .getJsxChildren()
    .filter((c) => {
      if (Node.isJsxText(c)) {
        return c.getText().trim().length > 0;
      }
      if (Node.isJsxExpression(c)) {
        return c.getExpression() !== undefined;
      }
      return true;
    });

  if (children.length !== 1) return null;
  const only = children[0]!;

  if (Node.isJsxElement(only) || Node.isJsxSelfClosingElement(only)) {
    return only;
  }
  return null;
}

function getAttributeNameNodes(
  element: tm.JsxOpeningElement | tm.JsxSelfClosingElement,
): tm.JsxAttribute[] {
  return element
    .getAttributes()
    .filter((a): a is tm.JsxAttribute => a.getKind() === SyntaxKind.JsxAttribute);
}

function transformOpeningElement(
  opening: tm.JsxOpeningElement,
): boolean {
  // Already has render? skip.
  if (attrExists(opening, "render")) return false;
  if (!attrExists(opening, "asChild")) return false;

  const parent = opening.getParent();
  if (!parent || !Node.isJsxElement(parent)) return false;

  // The single child must be a JSX element (opening+body+closing) or self-closing.
  const childElement = getSingleJsxChildElement(parent);
  if (!childElement) return false;

  // We work with the *child element node* (JsxElement or JsxSelfClosingElement),
  // not just its opening tag, because we need the body span too.
  let childNode: tm.JsxElement | tm.JsxSelfClosingElement;
  if (Node.isJsxSelfClosingElement(childElement)) {
    childNode = childElement;
  } else if (Node.isJsxElement(childElement)) {
    childNode = childElement;
  } else {
    // childElement is a JsxOpeningElement — climb to its JsxElement parent.
    const owner = childElement.getParent();
    if (!owner || !Node.isJsxElement(owner)) return false;
    childNode = owner;
  }

  // Skip nested-trigger chains (e.g. DialogTrigger > TooltipTrigger > Button).
  // These are rare and the render-prop semantics of composing two triggers is
  // ambiguous; flag for manual review instead of risking silent breakage.
  const childTagNameNode = Node.isJsxSelfClosingElement(childNode)
    ? childNode.getTagNameNode()
    : childNode.getOpeningElement().getTagNameNode();
  const childTagName = childTagNameNode.getText();
  const childTagLast = childTagName.split(".").pop() ?? childTagName;
  if (TRIGGER_NAMES.has(childTagName) || TRIGGER_NAMES.has(childTagLast)) {
    return false;
  }

  const fullText = parent.getSourceFile().getFullText();

  // --- Build the new trigger text via source-span slicing (preserves formatting) ---

  // 1. Trigger opening tag text, minus the `asChild` attribute.
  const openingTagText = opening.getText().replace(/\basChild\b(\s*=\s*\{?\s*(?:true|false)?\s*\}?)?/, "").trimEnd();

  // 2. `render={<ChildOpeningTag />}` — take the child's opening tag and make it self-closing.
  let childOpeningTagText: string;
  let childBodyText: string;
  if (Node.isJsxSelfClosingElement(childNode)) {
    childOpeningTagText = childNode.getText(); // already self-closing
    childBodyText = "";
  } else {
    // JsxElement: opening element + body + closing element.
    const childOpening = childNode.getOpeningElement();
    const childClosing = childNode.getClosingElement();
    childOpeningTagText = childOpening.getText();
    // Make it self-closing: strip trailing whitespace then replace trailing '>' with ' />'
    // (only if not already self-closing). Handle the case where '>' is the last char.
    childOpeningTagText = childOpeningTagText.replace(/\s*>\s*$/, " />");
    // Body = source text strictly between opening tag end and closing tag start.
    const bodyStart = childOpening.getEnd();
    const bodyEnd = childClosing.getStart();
    childBodyText = fullText.slice(bodyStart, bodyEnd);
  }

  // 3. Assemble: <Trigger [otherAttrs] render={<Child />}>childBody</Trigger>
  //    Insert `render={...}` into the trigger opening tag (after removing asChild).
  //    openingTagText no longer contains asChild. Append render prop before the closing '>'.
  const renderProp = `render={${childOpeningTagText}}`;
  let newOpeningTagText: string;
  if (/\s*\/>\s*$/.test(openingTagText)) {
    // shouldn't happen for an opening element, but guard
    newOpeningTagText = openingTagText.replace(/\s*\/>\s*$/, " ") + renderProp + ">";
  } else {
    newOpeningTagText = openingTagText.replace(/\s*>\s*$/, " ") + renderProp + ">";
  }

  const triggerTagName = opening.getTagNameNode().getText();
  const newBlock = `${newOpeningTagText}${childBodyText}</${triggerTagName}>`;

  if (mode === "write") {
    parent.replaceWithText(newBlock);
  }
  return true;
}

function run(): FileResult[] {
  const project = new Project({
    tsConfigFilePath: path.join(ROOT, "tsconfig.json"),
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
    compilerOptions: {
      jsx: 4, // JsxFormat.Preserve — keep formatting faithful
      allowJs: true,
    },
  });

  // Add files explicitly via glob so we control scope (apps/web/src only).
  const sourceFiles = project.addSourceFilesAtPaths(
    path.join(ROOT, targetGlob),
  );

  const results: FileResult[] = [];

  for (const sourceFile of sourceFiles) {
    let transformedInFile = 0;

    // In dry-run the source tree is never mutated, so re-querying would loop
    // forever on the same node. Instead, collect all distinct targets up front
    // (by start position so nested-trigger duplicates are deduped) and process
    // each exactly once. In write mode, transforms mutate the tree and node
    // references go stale, so we re-collect after every successful transform
    // and match by position to skip already-handled ones.
    const handledPositions = new Set<number>();

    const collectTargets = () => {
      const seen = new Set<number>();
      const out: tm.JsxOpeningElement[] = [];
      for (const o of sourceFile.getDescendantsOfKind(SyntaxKind.JsxOpeningElement)) {
        if (!isTriggerElement(o)) continue;
        if (!attrExists(o, "asChild")) continue;
        if (attrExists(o, "render")) continue;
        const pos = o.getStart();
        if (handledPositions.has(pos)) continue;
        // De-dupe within this pass (e.g. nested triggers share no position,
        // but guard anyway).
        if (seen.has(pos)) continue;
        seen.add(pos);
        out.push(o);
      }
      return out;
    };

    // Dry-run: snapshot once, report count of transformable targets only.
    if (mode === "dry-run") {
      let count = 0;
      for (const t of collectTargets()) {
        // Mirror transformOpeningElement's preconditions to count accurately.
        const parent = t.getParent();
        if (!parent || !Node.isJsxElement(parent)) continue;
        const child = getSingleJsxChildElement(parent);
        if (!child) continue;
        const childTagNameNode = Node.isJsxSelfClosingElement(child)
          ? child.getTagNameNode()
          : child.getOpeningElement().getTagNameNode();
        const childTag = childTagNameNode.getText();
        const childLast = childTag.split(".").pop() ?? childTag;
        if (TRIGGER_NAMES.has(childTag) || TRIGGER_NAMES.has(childLast)) continue;
        count++;
      }
      transformedInFile = count;
    } else {
      // Write mode: loop, transforming one at a time, re-querying each pass.
      for (;;) {
        const targets = collectTargets();
        if (targets.length === 0) break;
        const target = targets[0]!;
        const pos = target.getStart();
        const did = transformOpeningElement(target);
        handledPositions.add(pos);
        if (did) transformedInFile++;
        if (!did) {
          // Skip un-transformable (e.g. multiple children) but keep going.
        }
      }
    }

    if (transformedInFile > 0) {
      if (mode === "write") {
        sourceFile.saveSync();
      }
      results.push({
        file: path.relative(ROOT, sourceFile.getFilePath()),
        transformed: transformedInFile,
      });
    }
  }

  return results;
}

const results = run();
const total = results.reduce((sum, r) => sum + r.transformed, 0);

if (results.length === 0) {
  console.log(
    mode === "dry-run"
      ? "[dry-run] No `<Trigger asChild>` patterns found matching the criteria."
      : "No changes needed.",
  );
} else {
  console.log(
    mode === "dry-run"
      ? `[dry-run] Would transform ${total} occurrence(s) across ${results.length} file(s):`
      : `Transformed ${total} occurrence(s) across ${results.length} file(s):`,
  );
  for (const r of results) {
    console.log(`  ${r.transformed.toString().padStart(3)}  ${r.file}`);
  }
}
