import type { InitialConfigType } from "@lexical/react/LexicalComposer";
import type { EditorThemeClasses } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { MarkNode } from "@lexical/mark";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { ImageNode } from "./nodes/image-node";
import { InlineImageNode } from "./nodes/InlineImageNode";
import { DraggableBlockNode } from "./nodes/draggable-block-node";

export const theme: EditorThemeClasses = {
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    underlineStrikethrough: "underline line-through",
    subscript: "text-[0.8em] -bottom-[0.25em]",
    superscript: "text-[0.8em] top-[-0.5em]",
  },
  heading: {
    h1: "text-3xl font-bold mt-6 mb-4 text-gray-900",
    h2: "text-2xl font-bold mt-5 mb-3 text-gray-900",
    h3: "text-xl font-bold mt-4 mb-2 text-gray-900",
    h4: "text-lg font-bold mt-3 mb-1 text-gray-900",
    h5: "text-base font-bold mt-2 mb-1 text-gray-900",
    h6: "text-sm font-bold mt-2 mb-1 text-gray-900",
  },
  list: {
    ul: "list-disc list-inside pl-4 my-2",
    ol: "list-decimal list-inside pl-4 my-2",
    listitem: "ml-4 my-1",
    nested: {
      listitem: "ml-8",
    },
    checklist: "flex items-center gap-2 my-1",
  },
  image: "max-w-full h-auto my-4 rounded-md",
  quote: "border-l-4 border-gray-200 pl-4 my-4 italic text-gray-700",
  link: "text-primary underline cursor-pointer hover:text-primary/80",
  code: "bg-muted px-1.5 py-0.5 rounded font-mono text-sm",
  codeHighlight: {
    atrule: "text-primary",
    attr: "text-primary",
    boolean: "text-primary",
    builtin: "text-primary",
    cdata: "text-primary",
    char: "text-primary",
    class: "text-primary",
    "class-name": "text-primary",
    comment: "text-muted-foreground",
    constant: "text-primary",
    deleted: "text-primary",
    doctype: "text-primary",
    entity: "text-primary",
    function: "text-primary",
    important: "text-primary",
    inserted: "text-primary",
    keyword: "text-primary",
    namespace: "text-primary",
    number: "text-primary",
    operator: "text-primary",
    prolog: "text-primary",
    property: "text-primary",
    punctuation: "text-primary",
    regex: "text-primary",
    selector: "text-primary",
    string: "text-primary",
    symbol: "text-primary",
    tag: "text-primary",
    url: "text-primary",
    variable: "text-primary",
  },
  table: "border-collapse border border-border w-full my-4",
  tableCell: "border border-border p-2",
  tableRow: "hover:bg-muted/50",
  tableCellHeader: "bg-muted font-bold",
  mark: "bg-yellow-200 rounded px-1",
  markOverlap: "bg-yellow-100",
  draggableBlock: "relative hover:bg-muted/50 rounded-lg p-2 transition-colors",
  horizontalRule: "my-6 border-t border-gray-200",
  paragraph: "my-2 leading-relaxed text-gray-800",
};

export const editorConfig: InitialConfigType = {
  namespace: "email-editor",
  theme,
  onError: (error: Error) => {
    console.error(error);
  },
  nodes: [
    HeadingNode,
    QuoteNode,
    ListNode,
    ListItemNode,
    CodeNode,
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    AutoLinkNode,
    LinkNode,
    ImageNode,
    InlineImageNode,
    MarkNode,
    DraggableBlockNode,
    HorizontalRuleNode,
  ],
};
