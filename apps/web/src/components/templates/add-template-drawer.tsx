"use client";

import { useState, useRef } from "react";
import { useForm } from "react-hook-form";
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
import { Template } from "@coldjot/types";

type FormData = {
  name: string;
  subject: string;
  content: string;
};

interface Props {
  onClose: () => void;
  onSave: (template: Template) => void;
}

export default function AddTemplateDrawer({ onClose, onSave }: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const { register, handleSubmit, setValue, watch } = useForm<FormData>();
  const content = watch("content");

  const onSubmit = async (data: FormData) => {
    if (isLinkDialogOpen) return;

    try {
      setIsSaving(true);
      const response = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to create template");

      const template = await response.json();
      onSave(template);
      toast.success("Template created successfully");
      onClose();
    } catch (error) {
      console.error("Error creating template:", error);
      toast.error("Failed to create template");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-[800px] sm:max-w-[800px] h-[100dvh] p-0">
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex flex-col h-full"
        >
          <SheetHeader className="px-6 py-4 border-b">
            <SheetTitle>Create New Template</SheetTitle>
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
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isLinkDialogOpen}>
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Template"
                )}
              </Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
