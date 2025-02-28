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
import { Loader2, Send, Info } from "lucide-react";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";
import { TemplateCommand } from "@/components/templates/template-command";
import { toast } from "react-hot-toast";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
    templateId?: string;
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
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState<
    string | undefined
  >(initialData?.templateId);
  const [isTemplateUnlinked, setIsTemplateUnlinked] = useState(
    !initialData?.templateId
  );

  const isEditorDisabled = Boolean(currentTemplateId) && !isTemplateUnlinked;

  // Fetch template content when templateId changes or on initial load
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    const fetchTemplate = async () => {
      if (!currentTemplateId || isTemplateUnlinked) {
        setIsLoadingTemplate(false);
        return;
      }

      setIsLoadingTemplate(true);
      try {
        const response = await fetch(`/api/templates/${currentTemplateId}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const template = await response.json();

        if (isMounted) {
          setSubject(template.subject);
          setContent(template.content);
        }
      } catch (error: any) {
        if (error?.name === "AbortError") return;

        console.error("Error fetching template:", error);
        if (isMounted) {
          toast.error(
            "Failed to load template content. Unlinking from template."
          );
          setIsTemplateUnlinked(true);
          setCurrentTemplateId(undefined);
          if (initialData) {
            setSubject(initialData.subject || "");
            setContent(initialData.content || "");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingTemplate(false);
        }
      }
    };

    fetchTemplate();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [currentTemplateId, isTemplateUnlinked, initialData]);

  // Update state when initialData changes
  useEffect(() => {
    if (initialData) {
      const hasTemplate = Boolean(initialData.templateId);
      setCurrentTemplateId(initialData.templateId);
      setIsTemplateUnlinked(!hasTemplate);

      // Set content and subject based on template status
      if (!hasTemplate) {
        setIsLoadingTemplate(false);
        setContent(initialData.content || "");
        setSubject(initialData.subject || "");
      }

      setIncludeSignature(initialData.includeSignature ?? true);
      setReplyToThread(initialData.replyToThread ?? false);
    }
  }, [initialData]);

  const handleTemplateSelect = async (template: {
    id: string;
    subject: string;
    content: string;
  }) => {
    setIsLoadingTemplate(true);
    try {
      setCurrentTemplateId(template.id);
      setIsTemplateUnlinked(false);
      setSubject(template.subject);
      setContent(template.content);
    } catch (error) {
      console.error("Error selecting template:", error);
      toast.error("Failed to apply template");
      setIsTemplateUnlinked(true);
      setCurrentTemplateId(undefined);
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const handleUnlinkTemplate = (checked: boolean) => {
    setIsTemplateUnlinked(checked);
    if (checked) {
      // When unlinking, keep the current content and subject editable
      // but clear the template connection
      setCurrentTemplateId(undefined);
    } else {
      // When relinking, fetch the template content again
      if (initialData?.templateId) {
        setCurrentTemplateId(initialData.templateId);
        fetchTemplateContent();
      }
    }
  };

  // Move fetchTemplateContent outside of useEffect so we can reuse it
  const fetchTemplateContent = async () => {
    if (!currentTemplateId || isTemplateUnlinked) {
      setIsLoadingTemplate(false);
      return;
    }

    setIsLoadingTemplate(true);
    try {
      const response = await fetch(`/api/templates/${currentTemplateId}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const template = await response.json();
      setSubject(template.subject);
      setContent(template.content);
    } catch (error) {
      console.error("Error fetching template:", error);
      toast.error("Failed to load template content. Unlinking from template.");
      setIsTemplateUnlinked(true);
      setCurrentTemplateId(undefined);
      // Restore original content if available
      if (initialData) {
        setSubject(initialData.subject || "");
        setContent(initialData.content || "");
      }
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      subject,
      content,
      includeSignature,
      replyToThread,
      templateId: isTemplateUnlinked ? null : currentTemplateId,
    });
  };

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
    return htmlContent.replace(/<p><\/p>/g, "<p>&nbsp;</p>");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-11/12 sm:w-[100%] max-w-[100%] h-[100vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {initialData ? "Edit Email" : "Create Email"}
          </DialogTitle>
        </DialogHeader>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="grid grid-cols-2 gap-6 flex-1 min-h-0">
            {/* Left column */}
            <div className="flex flex-col gap-4 overflow-hidden">
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
                <div className="px-px">
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Enter email subject"
                    disabled={isEditorDisabled || isLoadingTemplate}
                  />
                </div>
              </div>

              {currentTemplateId && (
                <div className="flex-shrink-0 flex items-center gap-2">
                  <Checkbox
                    id="unlink-template"
                    checked={isTemplateUnlinked}
                    onCheckedChange={handleUnlinkTemplate}
                    disabled={isLoadingTemplate}
                  />
                  <Label htmlFor="unlink-template">
                    {isLoadingTemplate
                      ? "Loading template..."
                      : "Unlink from template"}
                  </Label>
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        onClick={(e) => e.preventDefault()}
                      >
                        <div className="p-0.5 hover:bg-muted rounded-sm cursor-help">
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px]">
                        <p className="text-sm">
                          Unlinking allows you to edit the content freely.
                          Changes won't affect the original template.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              <div className="flex-1 overflow-hidden px-px">
                {isLoadingTemplate &&
                currentTemplateId &&
                !isTemplateUnlinked ? (
                  <div className="h-full flex items-center justify-center bg-muted/10 rounded-md">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">
                        Loading template content...
                      </p>
                    </div>
                  </div>
                ) : (
                  <RichTextEditor
                    key={`editor-${isEditorDisabled}`}
                    initialContent={content}
                    onChange={setContent}
                    placeholder="Write your email content..."
                    className={cn(
                      "h-full flex flex-col",
                      isEditorDisabled && "opacity-70"
                    )}
                    editorClassName="flex-1 overflow-y-auto"
                    readOnly={isEditorDisabled}
                  />
                )}
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
            <div className="flex flex-col min-h-0 overflow-hidden">
              <div className="flex-shrink-0 space-y-2 p-6 bg-muted/30">
                <h3 className="text-sm font-medium">
                  Generate Preview for Contact (optional)
                </h3>
                <Input placeholder="Choose a contact" />
              </div>

              <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
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
              {sequenceId && stepId && (
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
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
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[260px]">
                      <p className="text-sm">
                        Send a sample email to your registered email address to
                        preview how it will look.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
