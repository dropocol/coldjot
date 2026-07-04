"use client";

import { useState, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@coldjot/ui/components/select";
import { Button } from "@coldjot/ui/components/button";
import { Send, Save, Code, Loader2 } from "lucide-react";
import { Contact, Template } from "@prisma/client";
import { toast } from "react-hot-toast";
import { Label } from "@coldjot/ui/components/label";
import { ContactSearch } from "../search/contact-search-dropdown";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";
import { Input } from "@coldjot/ui/components/input";
import {
  useCreateDraft,
  useSendDraft,
} from "@/hooks/queries/use-drafts";

interface Props {
  templates: Template[];
}

interface TemplateVariable {
  name: string;
  value: string | null;
  source: string;
  path?: string;
}

function flattenObject(
  obj: Record<string, unknown>,
  _prefix = ""
): Record<string, string> {
  const flattened: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    // if (key === "company" && value && typeof value === "object") {
    //   // Special handling for company object
    //   Object.entries(value).forEach(([companyKey, companyValue]) => {
    //     if (
    //       companyValue !== null &&
    //       companyValue !== undefined &&
    //       !["id", "userId", "createdAt", "updatedAt"].includes(companyKey)
    //     ) {
    //       flattened[`company_${companyKey}`] = String(companyValue);
    //     }
    //   });
    //   continue; // Skip the default handling for company object
    // }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      // For other nested objects
      const nested = flattenObject(value as Record<string, unknown>, key);
      Object.entries(nested).forEach(([nestedKey, nestedValue]) => {
        flattened[nestedKey] = nestedValue;
      });
    } else if (
      value !== null &&
      value !== undefined &&
      !["id", "userId", "createdAt", "updatedAt"].includes(key)
    ) {
      // For direct values, excluding certain fields
      flattened[key] = String(value);
    }
  }

  return flattened;
}

function extractVariables(text: string): string[] {
  const regex = /{{([^}]+)}}/g;
  const matches = text.match(regex) || [];
  return matches.map((match) => match.slice(2, -2).trim());
}

function replaceVariablesWithValues(
  text: string,
  flatData: Record<string, string>,
  fallbacks: Record<string, string>
): string {
  return text.replace(/{{([^}]+)}}/g, (match, variable) => {
    const trimmedVar = variable.trim();
    return flatData[trimmedVar] || fallbacks[trimmedVar] || match;
  });
}

export default function EmailComposer({ templates }: Props) {
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("");
  const [rawContent, setRawContent] = useState("");
  const [processedContent, setProcessedContent] = useState("");
  const [subject, setSubject] = useState("");
  const [processedSubject, setProcessedSubject] = useState("");
  const [showRawContent, setShowRawContent] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [fallbacks, setFallbacks] = useState<Record<string, string>>({});
  const [templateVariables, setTemplateVariables] = useState<
    TemplateVariable[]
  >([]);
  const [showVariablePanel, setShowVariablePanel] = useState(false);
  const createDraft = useCreateDraft();
  const sendDraft = useSendDraft();
  const isSaving = createDraft.isPending;
  const isSending = createDraft.isPending || sendDraft.isPending;

  useEffect(() => {
    try {
      const savedContactStr = localStorage.getItem("selectedContact");
      if (savedContactStr) {
        const contact = JSON.parse(savedContactStr);
        setSelectedContact(contact);
        localStorage.removeItem("selectedContact");
      }
    } catch {
      // Ignore a corrupt saved-contact payload.
    }
  }, []);

  useEffect(() => {
    if (selectedTemplate && templates) {
      const template = templates.find((t) => t.id === selectedTemplate);
      if (template) {
        setRawContent(template.content || "");
        setSubject(template.subject || "");
      }
    } else {
      setRawContent("");
      setSubject("");
    }
  }, [selectedTemplate, templates]);

  useEffect(() => {
    if (selectedContact && (rawContent || subject)) {
      // Flatten contact data
      const flatData = flattenObject({
        ...selectedContact,
      });

      // Process content and subject
      const processedContentText = replaceVariablesWithValues(
        rawContent,
        flatData,
        fallbacks
      );
      const processedSubjectText = replaceVariablesWithValues(
        subject,
        flatData,
        fallbacks
      );

      setProcessedContent(processedContentText);
      setProcessedSubject(processedSubjectText);

      // Extract and store variables for display
      const contentVariables = extractVariables(rawContent);
      const subjectVariables = extractVariables(subject);
      const allVariables = [
        ...new Set([...contentVariables, ...subjectVariables]),
      ];

      const mappedVariables = allVariables.map((variable) => ({
        name: variable,
        value: flatData[variable] || null,
        source: flatData[variable] ? "contact" : "unassigned",
        path: variable,
      }));

      setTemplateVariables(mappedVariables);
    }
  }, [selectedContact, rawContent, subject, fallbacks]);

  const handleSaveAsDraft = async () => {
    try {
      if (!selectedContact || !selectedTemplate) return;
      await createDraft.mutateAsync({
        contactId: selectedContact.id,
        templateId: selectedTemplate,
        content: rawContent,
      });
      toast.success("Draft saved successfully");
    } catch (_error) {
      toast.error("Failed to save draft");
    }
  };

  const handleSendEmail = async () => {
    try {
      if (!selectedContact || !selectedTemplate) return;
      // Create the draft, then send it.
      const draft = await createDraft.mutateAsync({
        contactId: selectedContact.id,
        templateId: selectedTemplate,
        content: rawContent,
      });
      await sendDraft.mutateAsync(draft.id);
      toast.success("Email sent successfully");
    } catch (_error) {
      toast.error("Failed to send email");
    }
  };

  const renderVariablePanel = () => (
    <div className="mt-4 border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">Template Variables</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowVariablePanel(!showVariablePanel)}
        >
          {showVariablePanel ? "Hide Variables" : "Show Variables"}
        </Button>
      </div>

      {showVariablePanel && (
        <div className="space-y-4">
          {templateVariables.map((variable) => (
            <div
              key={variable.name}
              className="flex items-center justify-between p-2 bg-muted rounded-md"
            >
              <div>
                <span className="font-mono text-sm">
                  {`{{${variable.name}}}`}
                </span>
                <span className="ml-2 text-sm text-muted-foreground">
                  {variable.source === "contact" ? "(mapped)" : "(unassigned)"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {variable.source === "unassigned" && (
                  <Input
                    className="w-48"
                    placeholder="Set fallback value"
                    value={fallbacks[variable.name] || ""}
                    onChange={(e) => {
                      setFallbacks((prev) => ({
                        ...prev,
                        [variable.name]: e.target.value,
                      }));
                    }}
                  />
                )}
                <span className="text-sm">
                  {variable.value || fallbacks[variable.name] || "No value"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const renderDebugPanel = () => {
    if (!selectedContact) return null;

    const flatData = flattenObject({
      ...selectedContact,
    });

    return (
      <div className="mt-4 p-4 border rounded-lg bg-muted/50">
        <h3 className="text-sm font-medium mb-2">Available Variables</h3>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(flatData).map(([key, value]) => (
            <div key={key} className="text-sm">
              <span className="font-mono">{`{{${key}}}`}</span>: {value}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium">Contact</label>
          <ContactSearch
            selectedContact={selectedContact}
            onSelect={setSelectedContact}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Select Template</label>
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="subject">Subject</Label>
            <div className="text-sm text-muted-foreground">
              {selectedContact ? processedSubject : subject}
            </div>
          </div>
          <Input
            id="subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Enter email subject"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Content</Label>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowRawContent(!showRawContent)}
            >
              <Code className="h-4 w-4 mr-2" />
              {showRawContent ? "Show Processed" : "Show Template"}
            </Button>
          </div>
          <RichTextEditor
            initialContent={showRawContent ? rawContent : processedContent}
            onChange={showRawContent ? setRawContent : () => {}}
            placeholder="Write your email content here..."
            onLinkDialogChange={setIsLinkDialogOpen}
            readOnly={!showRawContent}
          />
        </div>

        {renderVariablePanel()}

        {renderDebugPanel()}
      </div>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={handleSaveAsDraft}
          disabled={
            !selectedContact ||
            !selectedTemplate ||
            isSaving ||
            isLinkDialogOpen
          }
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          {isSaving ? "Saving..." : "Save as Draft"}
        </Button>
        <Button
          onClick={handleSendEmail}
          disabled={
            !selectedContact ||
            !selectedTemplate ||
            isSending ||
            isLinkDialogOpen
          }
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 mr-2" />
          )}
          {isSending ? "Sending..." : "Send Email"}
        </Button>
      </div>
    </div>
  );
}
