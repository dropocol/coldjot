"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@coldjot/ui/components/dialog";
import { Button } from "@coldjot/ui/components/button";
import { Input } from "@coldjot/ui/components/input";
import { Label } from "@coldjot/ui/components/label";
import { Checkbox } from "@coldjot/ui/components/checkbox";
import { Loader2, Info, AlertCircle } from "lucide-react";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";
import { TemplateCommand } from "@/components/templates/template-command";
import type { EmailData } from "@coldjot/types";
import { toast } from "sonner";
import { Switch } from "@coldjot/ui/components/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@coldjot/ui/components/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@coldjot/ui/components/alert-dialog";
import { cn } from "@coldjot/ui/lib/utils";
import { api } from "@/lib/http/api-client";

interface SequenceEmailEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: EmailData) => void;
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
  const [includeSignature, setIncludeSignature] = useState(initialData?.includeSignature ?? true);
  const [replyToThread, setReplyToThread] = useState(initialData?.replyToThread ?? false);
  const [_isSending, _setIsSending] = useState(false);
  const [_isSendingTest, setIsSendingTest] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | undefined>(
    initialData?.templateId
  );
  const [isTemplateUnlinked, setIsTemplateUnlinked] = useState(!initialData?.templateId);
  const [showUnlinkAlert, setShowUnlinkAlert] = useState(false);
  // True when a linked step's template failed to load. We do NOT silently
  // unlink in that case — for a linked step, initialData.subject/content are
  // null (the template is the source of truth), so unlinking to the fallback
  // would save an empty step and produce blank emails. Instead we surface a
  // blocking error and force the user to pick a new template or write custom
  // content. See plans/template-delete-guards/STATUS.md follow-ups.
  const [templateLoadError, setTemplateLoadError] = useState(false);

  const isEditorDisabled = Boolean(currentTemplateId) && !isTemplateUnlinked;

  // Fetch template content when templateId changes or on initial load
  useEffect(() => {
    let isMounted = true;

    const fetchTemplate = async () => {
      if (!currentTemplateId || isTemplateUnlinked) {
        setIsLoadingTemplate(false);
        return;
      }

      setIsLoadingTemplate(true);
      try {
        const template = await api.get<{
          subject: string;
          content: string;
        }>(`/api/templates/${currentTemplateId}`);

        if (isMounted) {
          setSubject(template.subject);
          setContent(template.content);
        }
      } catch (_error) {
        if (isMounted) {
          // Don't silently unlink — for a linked step, the step's own
          // subject/content are null, so unlinking would save an empty step
          // and produce blank emails. Keep the step linked (the templateId is
          // preserved) and surface a blocking error instead.
          setTemplateLoadError(true);
          toast.error("Failed to load template content. Pick a new template or switch to custom content.");
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
      // Picking a new template clears any prior load error.
      setTemplateLoadError(false);
    } catch (_error) {
      toast.error("Failed to apply template");
      setIsTemplateUnlinked(true);
      setCurrentTemplateId(undefined);
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  const handleUnlinkTemplate = (checked: boolean) => {
    if (checked) {
      setShowUnlinkAlert(true);
    } else {
      // When relinking, fetch the template content again
      if (initialData?.templateId) {
        setCurrentTemplateId(initialData.templateId);
        fetchTemplateContent();
      }
    }
  };

  const confirmUnlink = () => {
    setIsTemplateUnlinked(true);
    setCurrentTemplateId(undefined);
    setShowUnlinkAlert(false);
  };

  // Move fetchTemplateContent outside of useEffect so we can reuse it
  const fetchTemplateContent = async () => {
    if (!currentTemplateId || isTemplateUnlinked) {
      setIsLoadingTemplate(false);
      return;
    }

    setIsLoadingTemplate(true);
    try {
      const template = await api.get<{ subject: string; content: string }>(
        `/api/templates/${currentTemplateId}`
      );
      setSubject(template.subject);
      setContent(template.content);
    } catch (_error) {
      // Don't silently unlink — for a linked step, the step's own
      // subject/content are null, so unlinking would save an empty step
      // and produce blank emails. Keep the step linked and surface a
      // blocking error instead. See comment on `templateLoadError`.
      setTemplateLoadError(true);
      toast.error("Failed to load template content. Pick a new template or switch to custom content.");
    } finally {
      setIsLoadingTemplate(false);
    }
  };

  // When the user starts writing custom content after a template-load error,
  // clear the error so they can save. They've taken the recovery action we
  // asked for. We also treat the step as unlinked at that point so the save
  // sends the custom content (templateId: null) instead of a dangling pointer.
  const handleContentChange = (newContent: string) => {
    setContent(newContent);
    if (templateLoadError && newContent.trim()) {
      setTemplateLoadError(false);
      setIsTemplateUnlinked(true);
      setCurrentTemplateId(undefined);
    }
  };

  const handleSubjectChange = (value: string) => {
    setSubject(value);
    if (templateLoadError && value.trim()) {
      setTemplateLoadError(false);
      setIsTemplateUnlinked(true);
      setCurrentTemplateId(undefined);
    }
  };

  // Block saving while the template failed to load AND the step has no
  // recoverable content (neither a working template pointer nor custom body).
  // This is the guard that prevents a blank step from ever being written.
  const hasRecoverableContent =
    (Boolean(currentTemplateId) && !isTemplateUnlinked) ||
    subject.trim().length > 0 ||
    content.trim().length > 0;
  const canSave = !templateLoadError || hasRecoverableContent;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      subject,
      content,
      includeSignature,
      replyToThread,
      templateId: isTemplateUnlinked ? null : currentTemplateId,
    });
  };

  const _handleSendTest = async () => {
    if (!sequenceId || !stepId) return;

    setIsSendingTest(true);
    try {
      await api.post(`/api/sequences/${sequenceId}/steps/${stepId}/test`, {
        subject,
        content,
        includeSignature,
      });
      toast.success("Test email sent successfully");
    } catch (_error) {
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
      <DialogContent className="w-11/12 sm:w-full sm:max-w-[90%] h-screen flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>{initialData ? "Edit Email" : "Create Email"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="grid grid-cols-2 gap-6 flex-1 min-h-0 p-0">
            {/* Left column */}
            <div className="flex flex-col gap-4 min-h-0">
              {previousStepId && (
                <div className="shrink-0 flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                  <div className="space-y-0.5">
                    <Label>Reply to Previous Email</Label>
                    <div className="text-sm text-muted-foreground">
                      Send this email as a reply to the previous step's thread
                    </div>
                  </div>
                  <Switch checked={replyToThread} onCheckedChange={setReplyToThread} />
                </div>
              )}

              <div className="shrink-0 space-y-4">
                <Label htmlFor="subject">Subject</Label>
                <div className="relative">
                  <Input
                    id="subject"
                    value={subject}
                    onChange={(e) => handleSubjectChange(e.target.value)}
                    placeholder="Enter email subject"
                    disabled={isEditorDisabled || isLoadingTemplate}
                  />
                </div>
              </div>

              {templateLoadError && (
                <div className="shrink-0 flex items-start gap-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-destructive" />
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">
                      Couldn&apos;t load this step&apos;s template
                    </p>
                    <p className="text-muted-foreground">
                      It may have been deleted or is unavailable. Pick a new
                      template below, or write custom content to save this step
                      without a template.
                    </p>
                  </div>
                </div>
              )}

              {currentTemplateId && (
                <div className="flex-shrink-0 flex items-center gap-2">
                  <Checkbox
                    id="unlink-template"
                    checked={isTemplateUnlinked}
                    onCheckedChange={handleUnlinkTemplate}
                    disabled={isLoadingTemplate}
                  />
                  <Label htmlFor="unlink-template">
                    {isLoadingTemplate ? "Loading template..." : "Unlink from template"}
                  </Label>
                  <TooltipProvider delay={300}>
                    <Tooltip>
                      <TooltipTrigger type="button" onClick={(e) => e.preventDefault()}>
                        <div className="p-0.5 hover:bg-muted rounded-sm cursor-help">
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px]">
                        <p className="text-sm">
                          Unlinking allows you to edit the content freely. Changes won't affect the
                          original template.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              <div className="flex-1 min-h-0">
                {isLoadingTemplate && currentTemplateId && !isTemplateUnlinked ? (
                  <div className="h-full flex items-center justify-center bg-muted/10 rounded-md">
                    <div className="flex flex-col items-center gap-2">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Loading template content...</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex-1 min-h-0 overflow-hidden rounded-md bg-background h-full">
                    <RichTextEditor
                      key={`editor-${isEditorDisabled}`}
                      initialContent={content}
                      onChange={handleContentChange}
                      placeholder="Write your email content..."
                      className={cn(
                        "h-full overflow-hidden flex flex-col",
                        isEditorDisabled && "opacity-70"
                      )}
                      // className="max-h-[calc(100vh-400px)]"
                      editorClassName="flex-1 min-h-[300px] overflow-y-auto"
                      readOnly={isEditorDisabled}
                    />
                  </div>
                )}
              </div>

              {/* <div className="flex-shrink-0 flex items-center space-x-2">
                <Checkbox
                  id="signature"
                  checked={includeSignature}
                  onCheckedChange={(checked) =>
                    setIncludeSignature(checked as boolean)
                  }
                />
                <Label htmlFor="signature">Include Signature</Label>
              </div> */}
            </div>

            {/* Right column - Preview */}
            <div className="flex flex-col min-h-0 overflow-hidden">
              {/* <div className="flex-shrink-0 space-y-2 p-6 bg-muted/30">
                <h3 className="text-sm font-medium">
                  Generate Preview for Contact (optional)
                </h3>
                <Input placeholder="Choose a contact" />
              </div> */}

              <div className="flex-1 overflow-y-auto p-6 bg-muted/30">
                <div className="p-4 bg-background rounded-lg">
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

              {/* DO NOT DELETE THIS */}
              {/* {sequenceId && stepId && (
                <TooltipProvider delay={300}>
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
              )} */}
            </div>
            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={!canSave}>
                Save
              </Button>
            </div>
          </div>
        </form>

        <AlertDialog open={showUnlinkAlert} onOpenChange={setShowUnlinkAlert}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Unlink from Template?</AlertDialogTitle>
              <AlertDialogDescription>
                This will disconnect the email from the template, allowing you to edit the content
                freely. Any changes you make won't affect the original template, and future template
                updates won't be reflected here. This action can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={confirmUnlink}>Unlink Template</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
