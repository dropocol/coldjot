"use client";

import { Contact } from "@prisma/client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";
import { replacePlaceholders, validatePlaceholders } from "@/lib/placeholders";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface PreviewPaneProps {
  subject: string;
  content: string;
  contact: Contact | null;
  fallbacks: Record<string, string>;
  customValues: Record<string, string>;
  open: boolean;
  onClose: () => void;
}

export function PreviewPane({
  subject,
  content,
  contact,
  fallbacks,
  customValues,
  open,
  onClose,
}: PreviewPaneProps) {
  const processedSubject = replacePlaceholders(subject, {
    contact,
    fallbacks,
    customValues,
  });

  const processedContent = replacePlaceholders(content, {
    contact,
    fallbacks,
    customValues,
  });

  const missingPlaceholders = validatePlaceholders(processedContent);

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        className="w-[600px] sm:max-w-[600px] h-[100dvh] p-0"
      >
        <div className="h-full flex flex-col">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Email Preview</SheetTitle>
          </SheetHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-6">
              {missingPlaceholders.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Missing values for placeholders:{" "}
                    {missingPlaceholders.join(", ")}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Subject</h3>
                <div className="p-3 bg-muted rounded-md">
                  {processedSubject}
                </div>
              </div>

              <div className="space-y-2">
                <h3 className="text-sm font-medium">Content</h3>
                <RichTextEditor
                  initialContent={processedContent}
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
