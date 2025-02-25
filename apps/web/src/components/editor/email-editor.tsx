"use client";

import { useState, useRef, useEffect } from "react";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin";
import { TabIndentationPlugin } from "@lexical/react/LexicalTabIndentationPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TablePlugin } from "@lexical/react/LexicalTablePlugin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toolbar } from "./toolbar";
import { editorConfig } from "./editor-config";
import { DragDropPlugin } from "./plugins/drag-drop-plugin";
import { ImagePlugin } from "./plugins/image-plugin";
import { ComponentPickerPlugin } from "./plugins/component-picker-plugin";
import { Send, Save, ArrowUpRight } from "lucide-react";
import { DragHandle } from "./drag-handle";
import { REORDER_NODES_COMMAND } from "./plugins/drag-drop-plugin";

function LexicalErrorBoundary({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}

function EmailEditorContent() {
  const editorRef = useRef<HTMLDivElement>(null);
  const [dragHandles, setDragHandles] = useState<
    Array<{ top: number; id: string }>
  >([]);
  const [editor] = useLexicalComposerContext();

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
    <div className="min-h-[400px]" ref={editorRef}>
      <div className="relative">
        <div className="sticky top-0 z-30 bg-white border-b">
          <Toolbar />
        </div>
        <div
          className="relative group"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
        >
          {dragHandles.map((handle) => (
            <DragHandle
              key={handle.id}
              style={{
                position: "absolute",
                top: handle.top,
                left: "-32px",
                zIndex: 20,
                width: "48px",
                height: "24px",
              }}
              onDragStart={(e) => handleDragStart(e, handle.id)}
              onAddClick={() => {
                editor.dispatchCommand(REORDER_NODES_COMMAND, {
                  fromKey: handle.id.replace("handle-", ""),
                  toKey: handle.id.replace("handle-", ""),
                });
              }}
            />
          ))}
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="min-h-[300px] px-8 py-3 outline-none [&>div]:editor-paragraph [&>div]:relative [&>div]:group/block" />
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
          <ImagePlugin />
          <ComponentPickerPlugin />
        </div>
      </div>
    </div>
  );
}

export function EmailEditor() {
  const [title, setTitle] = useState("Unnamed transactional");
  const [fromName, setFromName] = useState("Freelance");
  const [fromEmail, setFromEmail] = useState("zee");
  const [replyTo, setReplyTo] = useState("zee@zeeshankhan.me");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");

  return (
    <div className="flex flex-1 flex-col">
      {/* Sticky Header */}
      <div
        id="editor-status-bar"
        className="sticky top-0 z-20 w-full border-b border-gray-100 bg-white pb-0.5"
      >
        <div className="mx-auto flex items-center justify-between py-1 max-w-2xl px-8">
          <div className="mr-4 flex flex-1 items-center gap-1 pt-0.5">
            <div className="relative mb-9 flex w-full justify-between">
              <div className="relative grow">
                <div className="absolute inset-0">
                  <div className="flex items-center">
                    <p className="mt-[4px] cursor-pointer text-lg hover:opacity-100">
                      😔
                    </p>
                    <h1 className="header-text ml-2 mt-[5px] truncate border-b border-transparent hover:cursor-pointer hover:opacity-80 text-gray-900">
                      {title}
                    </h1>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="ghost" size="sm" className="gap-2">
              <ArrowUpRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" className="gap-2">
              <Save className="h-4 w-4" />
            </Button>
            <Button className="gap-2">
              <Send className="h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto mt-2 px-8 w-full max-w-2xl">
        <div className="flex flex-col">
          {/* Email Details */}
          <div className="group/pauseLoopHoverRegion relative mt-6 text-sm font-medium transition-all">
            <div className="pb-3">
              <div className="flex cursor-default justify-between space-x-6 items-center">
                <div className="w-[3.25rem] cursor-default pr-2 text-left">
                  <span className="text-sm tracking-wide text-gray-400">
                    Name
                  </span>
                </div>
                <div className="relative flex grow overflow-hidden">
                  <Input
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    className="border-none focus:ring-0"
                    placeholder="Sender Name"
                  />
                </div>
              </div>
            </div>

            <div className="pb-3">
              <div className="flex cursor-default justify-between space-x-6 items-center">
                <div className="w-[3.25rem] cursor-default pr-2 text-left">
                  <span className="text-sm tracking-wide text-gray-400">
                    From
                  </span>
                </div>
                <div className="relative flex grow overflow-hidden">
                  <Input
                    value={fromEmail}
                    onChange={(e) => setFromEmail(e.target.value)}
                    className="border-none focus:ring-0"
                    placeholder="From email"
                  />
                  <p className="z-10 ml-2 mr-4 text-sm text-gray-500">
                    @mail.zeeshankhan.me
                  </p>
                </div>
              </div>
            </div>

            <div className="pb-3">
              <div className="flex cursor-default justify-between space-x-6 items-center">
                <div className="w-[3.25rem] cursor-default pr-2 text-left">
                  <span className="text-sm tracking-wide text-gray-400">
                    Reply
                  </span>
                </div>
                <div className="relative flex grow overflow-hidden">
                  <Input
                    value={replyTo}
                    onChange={(e) => setReplyTo(e.target.value)}
                    className="border-none focus:ring-0"
                    placeholder="Optional reply email"
                  />
                </div>
              </div>
            </div>

            <div className="pb-3">
              <div className="flex cursor-default justify-between space-x-6 items-center">
                <div className="relative flex grow overflow-hidden">
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="border-none focus:ring-0"
                    placeholder="Subject line"
                  />
                </div>
              </div>
            </div>

            <div className="pb-3">
              <div className="flex cursor-default justify-between space-x-6 items-center">
                <div className="w-[3.25rem] cursor-default pr-2 text-left">
                  <span className="text-sm tracking-wide text-gray-400">
                    Preview
                  </span>
                </div>
                <div className="relative flex grow overflow-hidden">
                  <Input
                    value={previewText}
                    onChange={(e) => setPreviewText(e.target.value)}
                    className="border-none focus:ring-0"
                    placeholder="Optional preview text"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Editor */}
          <LexicalComposer initialConfig={editorConfig}>
            <EmailEditorContent />
          </LexicalComposer>
        </div>
      </div>
    </div>
  );
}
