"use client";

import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Button } from "@/components/ui/button";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
  Link as LinkIcon,
  Link2Off,
} from "lucide-react";
import { PlaceholderButton } from "@/components/email/placeholder-button";
import { LinkDialog } from "./link-dialog";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  initialContent: string;
  onChange: (content: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  onLinkDialogChange?: (isOpen: boolean) => void;
  className?: string;
  editorClassName?: string;
}

export function RichTextEditor({
  initialContent,
  onChange,
  placeholder = "Write something...",
  readOnly = false,
  onLinkDialogChange,
  className,
  editorClassName,
}: RichTextEditorProps) {
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: "text-primary underline",
        },
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none min-h-[200px] px-3 py-2",
          editorClassName
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editable: !readOnly,
  });

  useEffect(() => {
    if (editor && editor.getHTML() !== initialContent) {
      editor.commands.setContent(initialContent);
    }
  }, [editor, initialContent]);

  // Notify parent about link dialog state
  useEffect(() => {
    onLinkDialogChange?.(showLinkDialog);
  }, [showLinkDialog, onLinkDialogChange]);

  const handleButtonClick = (callback: () => void) => (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent form submission
    e.stopPropagation(); // Stop event bubbling
    callback();
  };

  if (!editor) {
    return null;
  }

  return (
    <div className={cn("border rounded-md flex flex-col", className)}>
      {!readOnly && (
        <div className="flex-shrink-0 border-b p-2 flex gap-1 flex-wrap items-center">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(() =>
              editor.chain().focus().toggleBold().run()
            )}
            className={editor.isActive("bold") ? "bg-muted" : ""}
            type="button"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(() =>
              editor.chain().focus().toggleItalic().run()
            )}
            className={editor.isActive("italic") ? "bg-muted" : ""}
            type="button"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(() =>
              editor.chain().focus().toggleBulletList().run()
            )}
            className={editor.isActive("bulletList") ? "bg-muted" : ""}
            type="button"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(() =>
              editor.chain().focus().toggleOrderedList().run()
            )}
            className={editor.isActive("orderedList") ? "bg-muted" : ""}
            type="button"
          >
            <ListOrdered className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(() =>
              editor.chain().focus().toggleBlockquote().run()
            )}
            className={editor.isActive("blockquote") ? "bg-muted" : ""}
            type="button"
          >
            <Quote className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleButtonClick(() => setShowLinkDialog(true))}
            className={editor.isActive("link") ? "bg-muted" : ""}
            disabled={editor.state.selection.empty}
            type="button"
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          {editor.isActive("link") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleButtonClick(() =>
                editor.chain().focus().unsetLink().run()
              )}
              type="button"
            >
              <Link2Off className="h-4 w-4" />
            </Button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <PlaceholderButton
              onSelectPlaceholder={(placeholder) => {
                editor.chain().focus().insertContent(placeholder).run();
              }}
            />
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleButtonClick(() =>
                  editor.chain().focus().undo().run()
                )}
                disabled={!editor.can().undo()}
                type="button"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleButtonClick(() =>
                  editor.chain().focus().redo().run()
                )}
                disabled={!editor.can().redo()}
                type="button"
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className={cn("flex-1 min-h-0 relative", editorClassName)}>
        <EditorContent editor={editor} className="h-full overflow-y-auto" />
      </div>
      <LinkDialog
        open={showLinkDialog}
        onOpenChange={setShowLinkDialog}
        onSubmit={(url) => {
          editor.chain().focus().setLink({ href: url }).run();
        }}
        initialUrl={
          editor.isActive("link") ? editor.getAttributes("link").href : ""
        }
      />
    </div>
  );
}
