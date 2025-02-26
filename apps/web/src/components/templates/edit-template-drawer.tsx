"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
import { Template } from "@coldjot/types";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "react-hot-toast";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";

interface Props {
  template: Template;
  onClose: () => void;
  onSave: (template: Template) => void;
}

type FormData = {
  name: string;
  subject: string;
  content: string;
};

export default function EditTemplateDrawer({
  template,
  onClose,
  onSave,
}: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const { register, handleSubmit, setValue, watch } = useForm<FormData>({
    defaultValues: {
      name: template.name,
      subject: template.subject,
      content: template.content,
    },
  });

  const content = watch("content");

  const handleCloseAttempt = () => {
    if (!isLinkDialogOpen) {
      onClose();
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (isLinkDialogOpen) {
      return;
    }

    const data = {
      name: watch("name"),
      subject: watch("subject"),
      content: watch("content"),
    };

    try {
      setIsSaving(true);
      console.log(data);
      const response = await fetch(`/api/templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to update template");

      const updatedTemplate = await response.json();
      onSave(updatedTemplate);
      toast.success("Template updated successfully");
    } catch (error) {
      console.error("Error updating template:", error);
      toast.error("Failed to update template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={handleCloseAttempt}>
      <SheetContent className="w-[800px] sm:max-w-[800px] h-[100dvh] p-0">
        <form onSubmit={onSubmit} className="flex flex-col h-full">
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Edit Template</SheetTitle>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="name">Template Name</Label>
                <Input
                  id="name"
                  {...register("name", {
                    required: "Template name is required",
                  })}
                  placeholder="Enter template name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Email Subject</Label>
                <Input
                  id="subject"
                  {...register("subject", {
                    required: "Email subject is required",
                  })}
                  placeholder="Enter email subject"
                />
              </div>

              <div className="space-y-2">
                <Label>Content</Label>
                <RichTextEditor
                  initialContent={content}
                  onChange={(newContent) => setValue("content", newContent)}
                  placeholder="Write your template content here..."
                  onLinkDialogChange={setIsLinkDialogOpen}
                />
              </div>
            </div>
          </div>

          <div className="px-6 py-4 border-t mt-auto">
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCloseAttempt}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isLinkDialogOpen}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
