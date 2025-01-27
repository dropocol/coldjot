"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Wand2, Loader2, Send } from "lucide-react";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import { TemplateCommand } from "@/components/templates/template-command";
import { toast } from "react-hot-toast";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface SequenceEmailEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: any) => void;
  initialData?: {
    subject?: string;
    content?: string;
    includeSignature?: boolean;
    replyToThread?: boolean;
  };
  sequenceId?: string;
  stepId?: string;
  previousStepId?: string;
}

export function SequenceEmailEditor({
  open,
  onClose,
  onSave,
  initialData,
  sequenceId,
  stepId,
  previousStepId,
}: SequenceEmailEditorProps) {
  const [content, setContent] = useState(initialData?.content || "");
  const [subject, setSubject] = useState(initialData?.subject || "");
  const [includeSignature, setIncludeSignature] = useState(
    initialData?.includeSignature ?? true
  );
  const [replyToThread, setReplyToThread] = useState(
    initialData?.replyToThread ?? false
  );
  const [isSending, setIsSending] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);

  // Update state when initialData changes
  useEffect(() => {
    if (initialData) {
      setContent(initialData.content || "");
      setSubject(initialData.subject || "");
      setIncludeSignature(initialData.includeSignature ?? true);
      setReplyToThread(initialData.replyToThread ?? false);
    }
  }, [initialData]);

  const handleTemplateSelect = (template: {
    subject: string;
    content: string;
  }) => {
    setSubject(template.subject);
    setContent(template.content);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      subject,
      content,
      includeSignature,
      replyToThread,
    });
  };

  useEffect(() => {
    console.log(content);
  }, [content]);

  const handleSendTest = async () => {
    if (!sequenceId || !stepId) return;

    setIsSendingTest(true);
    try {
      const response = await fetch(
        `/api/sequences/${sequenceId}/steps/${stepId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            content,
            includeSignature,
          }),
        }
      );

      if (!response.ok) throw new Error("Failed to send test email");
      toast.success("Test email sent successfully");
    } catch (error) {
      toast.error("Failed to send test email");
    } finally {
      setIsSendingTest(false);
    }
  };

  // Function to process content and preserve both HTML formatting and line breaks
  const processContent = (htmlContent: string) => {
    if (!htmlContent) return "";

    // Replace empty paragraphs with a non-breaking space to maintain their height
    return htmlContent.replace(/<p><\/p>/g, "<p>&nbsp;</p>");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-11/12 sm:w-[95%] max-w-[1400px] h-[95vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit Email" : "Create Email"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="grid grid-cols-2 gap-6 min-h-0 flex-1">
            {/* Left column */}
            <div className="flex flex-col gap-4 min-h-0">
              {previousStepId && (
                <div className="flex-shrink-0 flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div className="space-y-0.5">
                    <Label>Reply to Previous Email</Label>
                    <div className="text-sm text-muted-foreground">
                      Send this email as a reply to the previous step's thread
                    </div>
                  </div>
                  <Switch
                    checked={replyToThread}
                    onCheckedChange={setReplyToThread}
                  />
                </div>
              )}

              <div className="flex-shrink-0 space-y-4">
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Enter email subject"
                />
              </div>

              <div className="flex-1 min-h-0">
                <RichTextEditor
                  initialContent={content}
                  onChange={setContent}
                  placeholder="Write your email content..."
                  className="h-full flex flex-col"
                  editorClassName="flex-1 overflow-y-auto"
                />
              </div>

              <div className="flex-shrink-0 flex items-center space-x-2">
                <Checkbox
                  id="signature"
                  checked={includeSignature}
                  onCheckedChange={(checked) =>
                    setIncludeSignature(checked as boolean)
                  }
                />
                <Label htmlFor="signature">Include Signature</Label>
              </div>
            </div>

            {/* Right column - Preview */}
            <div className="flex flex-col min-h-0">
              <div className="flex-shrink-0 space-y-2 p-6 bg-muted/30">
                <h3 className="text-sm font-medium">
                  Generate Preview for Contact (optional)
                </h3>
                <Input placeholder="Choose a contact" />
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto p-6 bg-muted/30">
                <div className="p-4 bg-white rounded-lg">
                  <div className="text-sm text-muted-foreground">
                    <p>To: Example Contact &lt;example@google.com&gt;</p>
                    <p>Subject: {subject || "(No Subject)"}</p>
                  </div>
                  <div className="mt-4 prose prose-sm max-w-none [&>p]:mb-4 [&>p:last-child]:mb-0 [&_a]:text-primary hover:[&_a]:underline">
                    <div
                      className="break-words"
                      dangerouslySetInnerHTML={{
                        __html: processContent(content),
                      }}
                    />
                    {includeSignature && (
                      <div className="mt-4 text-sm text-muted-foreground">
                        <p>Best regards,</p>
                        <p>Your Name</p>
                        <p>Your Company</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex justify-between items-center pt-4 mt-4 border-t">
            <div className="flex items-center gap-2">
              <TemplateCommand onSelect={handleTemplateSelect} />
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => {}}
              >
                <Wand2 className="h-4 w-4" />
                AI assistant
              </Button>
              {sequenceId && stepId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendTest}
                  disabled={isSendingTest}
                >
                  {isSendingTest ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Send className="h-4 w-4 mr-2" />
                  )}
                  Send Test Email
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit">Save</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
