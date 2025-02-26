import { useRef, useState, useEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { DragDropPlugin } from "../plugins/drag-drop-plugin";
import ImagesPlugin from "../plugins/images-plugin";
import InlineImagePlugin from "../plugins/inline-images-plugin";
import { ComponentPickerPlugin } from "../plugins/component-picker-plugin";
import { HorizontalRulePlugin } from "../plugins/horizontal-rule-plugin";
import { DragHandle } from "../drag-handle";
import { REORDER_NODES_COMMAND } from "../plugins/drag-drop-plugin";
import DraggableBlockPlugin from "../plugins/draggable-block-plugin";
import { FloatingMenuPlugin } from "../plugins/floating-menu-plugin";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ImageIcon } from "lucide-react";
import { INSERT_INLINE_IMAGE_COMMAND } from "../plugins/inline-images-plugin";

function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

export function EditorContent() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [floatingAnchorElem, setFloatingAnchorElem] =
    useState<HTMLDivElement | null>(null);
  const [dragHandles, setDragHandles] = useState<
    Array<{ top: number; id: string }>
  >([]);
  const [editor] = useLexicalComposerContext();

  const onRef = (_floatingAnchorElem: HTMLDivElement) => {
    if (_floatingAnchorElem !== null) {
      setFloatingAnchorElem(_floatingAnchorElem);
    }
  };

  useEffect(() => {
    const updateDragHandles = () => {
      if (editorRef.current) {
        const paragraphs =
          editorRef.current.querySelectorAll(".editor-paragraph");
        const newDragHandles = Array.from(paragraphs).map((p, i) => ({
          top:
            p.getBoundingClientRect().top -
            editorRef.current!.getBoundingClientRect().top +
            20,
          id: `handle-${i}`,
        }));
        setDragHandles(newDragHandles);
      }
    };

    const observer = new MutationObserver(updateDragHandles);
    if (editorRef.current) {
      observer.observe(editorRef.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
      updateDragHandles();
    }

    return () => observer.disconnect();
  }, []);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");
    const dropTarget = e.target as HTMLElement;

    // Find the nearest paragraph element
    const targetParagraph = dropTarget.closest(".editor-paragraph");
    if (!targetParagraph) return;

    // Get the node keys
    const fromKey = draggedId.replace("handle-", "");
    const toKey = targetParagraph.getAttribute("data-lexical-node-key");

    if (fromKey && toKey) {
      editor.dispatchCommand(REORDER_NODES_COMMAND, {
        fromKey,
        toKey,
      });
    }
  };

  return (
    <div
      className="min-h-[400px] bg-white rounded-md shadow-sm border pl-6"
      ref={editorRef}
    >
      <div className="relative">
        <div className="flex items-center gap-2 p-2 border-b"></div>
        <div
          className="relative group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          <RichTextPlugin
            contentEditable={
              <div className="editor-scroller">
                <div className="editor" ref={onRef}>
                  <ContentEditable className="min-h-[300px] px-8 py-3 outline-none [&>div]:editor-paragraph [&>div]:relative [&>div]:group/block [&>div]:draggable-block" />
                </div>
              </div>
            }
            placeholder={
              <div className="pointer-events-none absolute left-8 top-3 text-muted-foreground">
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
          <DragDropPlugin />
          <ImagesPlugin />
          <InlineImagePlugin />
          <ComponentPickerPlugin />
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
