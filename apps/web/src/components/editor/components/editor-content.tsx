import { useRef, useState } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { $generateHtmlFromNodes } from "@lexical/html";

// Plugins
import ImagesPlugin from "../plugins/images-plugin";
import InlineImagePlugin from "../plugins/inline-images-plugin";
import { HorizontalRulePlugin } from "../plugins/horizontal-line-plugin";
import DraggableBlockPlugin from "../plugins/draggable-block-plugin";
import { FloatingMenuPlugin } from "../plugins/floating-menu-plugin";

function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function EditorContent() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [editor] = useLexicalComposerContext();

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  const handleExport = () => {
    editor.update(() => {
      const html = $generateHtmlFromNodes(editor);

      // Get clean text content
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = html;
      const textContent = tempDiv.textContent || "";
      const cleanText = textContent
        .replace(/\s+/g, " ")
        .replace(/\n+/g, "\n")
        .trim();

      // Create debug info
      const debugInfo = {
        html,
        cleanText,
        wordCount: cleanText.split(/\s+/).length,
        words: cleanText.split(/\s+/),
      };

      // Copy HTML to clipboard
      navigator.clipboard.writeText(html).then(() => {
        console.log("Debug Info:", debugInfo);
        console.log("Word count:", debugInfo.wordCount);
        console.log("Words:", debugInfo.words);
      });
    });
  };

  return (
    <div
      className="min-h-[400px] bg-white rounded-md shadow-sm border pl-6"
      ref={editorRef}
    >
      <div className="relative">
        <div className="flex items-center gap-2 p-2">
          <button
            onClick={handleExport}
            className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md transition-colors"
            title="Copy HTML content to clipboard"
          >
            Export HTML
          </button>
        </div>
        <div className="relative group">
          <RichTextPlugin
            contentEditable={
              <div className="editor-scroller">
                <div className="editor" ref={onRef}>
                  <ContentEditable className="min-h-[300px] px-8 py-3 outline-none [&>div]:editor-paragraph [&>div]:relative [&>div]:group/block [&>div]:draggable-block" />
                </div>
              </div>
            }
            placeholder={
              <div className="pointer-events-none absolute left-8 top-5 text-muted-foreground">
                Write your email...
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <TablePlugin />
          <TabIndentationPlugin />
          <MarkdownShortcutPlugin />
          <ImagesPlugin />
          <InlineImagePlugin />
          <FloatingMenuPlugin />
          {floatingAnchorElem && (
            <DraggableBlockPlugin anchorElem={floatingAnchorElem} />
          )}
          <HorizontalRulePlugin />
        </div>
      </div>
    </div>
  );
}
