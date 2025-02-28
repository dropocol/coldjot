"use client";

import { Template } from "@coldjot/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { toast } from "react-hot-toast";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";
import { cn } from "@/lib/utils";

export default function PreviewTemplateDrawer({
  template,
  onClose,
}: {
  template: Template;
  onClose: () => void;
}) {
  const copyToClipboard = async (text: string, isHtml = false) => {
    try {
      if (isHtml) {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([text], { type: "text/html" }),
            "text/plain": new Blob([text.replace(/<[^>]+>/g, "")], {
              type: "text/plain",
            }),
          }),
        ]);
      } else {
        await navigator.clipboard.writeText(text);
      }
      toast.success("Copied to clipboard");
    } catch (err) {
      console.error("Copy failed:", err);
      // Fallback to basic text copy if HTML copy fails
      if (isHtml) {
        await navigator.clipboard.writeText(text.replace(/<[^>]+>/g, ""));
      }
      toast.error("Failed to copy with formatting, copied as plain text");
    }
  };

  const copyFormattedContent = () => {
    const editorElement = document.querySelector(".ProseMirror");
    if (!editorElement) return;

    // Create a temporary element to preserve formatting
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = editorElement.innerHTML;

    // Process links to show URLs
    const links = tempDiv.querySelectorAll("a");
    links.forEach((link) => {
      const url = link.getAttribute("href");
      if (url) {
        link.textContent = `${link.textContent} (${url})`;
      }
    });

    // Remove any contenteditable attributes
    const elements = tempDiv.querySelectorAll("[contenteditable]");
    elements.forEach((el) => el.removeAttribute("contenteditable"));

    // Process lists to ensure proper formatting
    const lists = tempDiv.querySelectorAll("ul, ol");
    lists.forEach((list) => {
      const items = list.querySelectorAll("li");
      items.forEach((item) => {
        if (list.tagName === "UL") {
          item.textContent = `• ${item.textContent}`;
        } else {
          const index = Array.from(list.children).indexOf(item) + 1;
          item.textContent = `${index}. ${item.textContent}`;
        }
      });
    });

    // Convert <br> to newlines
    const brs = tempDiv.querySelectorAll("br");
    brs.forEach((br) => br.replaceWith("\n"));

    // Convert <p> and other block elements to add proper spacing
    const blocks = tempDiv.querySelectorAll("p, div, h1, h2, h3, h4, h5, h6");
    blocks.forEach((block) => {
      if (block.textContent?.trim()) {
        block.textContent = `${block.textContent}\n`;
      }
    });

    // Get the formatted text
    let formattedText = tempDiv.innerText
      .replace(/\n{3,}/g, "\n\n") // Replace multiple line breaks with double line breaks
      .trim();

    // Try to copy with HTML formatting first, fallback to plain text
    copyToClipboard(tempDiv.innerHTML, true);
  };

  return (
    <Sheet open onOpenChange={onClose} modal={false}>
      <SheetContent
        side="right"
        className="w-[600px] sm:max-w-[600px] h-full p-0"
      >
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6">
            <SheetTitle>{template.name}</SheetTitle>
          </SheetHeader>
          <Separator />
          <ScrollArea className="flex-1 p-6">
            <div className="space-y-8">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Subject
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(template.subject)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div
                  className={cn(
                    "rounded-md border border-input bg-transparent px-3 py-2",
                    "focus-visible:outline-none focus-visible:ring-2",
                    "focus-visible:ring-ring focus-visible:ring-offset-2",
                    "min-h-[42px]"
                  )}
                >
                  <p className="text-sm">{template.subject}</p>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Template Content
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyFormattedContent}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <RichTextEditor
                  initialContent={template.content}
                  onChange={() => {}}
                  readOnly={true}
                  placeholder=""
                />
              </div>
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
