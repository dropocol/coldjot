"use client";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@coldjot/ui";
import { ScrollArea } from "@coldjot/ui";
import { Separator } from "@coldjot/ui";

export default function PreviewEmail({
  content,
  onClose,
}: {
  content: string;
  onClose: () => void;
}) {
  const formatContent = (content: string) => {
    return content.split("\n").map((line, i) => (
      <p key={i} className={line.trim() === "" ? "h-4" : ""}>
        {line}
      </p>
    ));
  };

  return (
    <Sheet open onOpenChange={onClose} modal={false}>
      <SheetContent
        side="right"
        className="w-[600px] sm:max-w-[600px] h-full p-0"
      >
        <div className="h-full flex flex-col">
          <SheetHeader className="p-6">
            <SheetTitle>Email Preview</SheetTitle>
          </SheetHeader>
          <Separator />
          <ScrollArea className="flex-1 p-6">
            <div className="prose prose-sm max-w-none">
              {formatContent(content)}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  );
}
