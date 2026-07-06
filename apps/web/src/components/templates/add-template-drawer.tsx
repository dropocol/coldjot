"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@coldjot/ui/components/sheet";
import { Button } from "@coldjot/ui/components/button";
import { Input } from "@coldjot/ui/components/input";
import { Label } from "@coldjot/ui/components/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RichTextEditor } from "@/components/editor-old/rich-text-editor";
import { Template } from "@coldjot/types";
import { useCreateTemplate } from "@/hooks/queries/use-templates";

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
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const createTemplate = useCreateTemplate();
  const isSaving = createTemplate.isPending;
  const { register, handleSubmit, setValue, watch } = useForm<FormData>();
  const content = watch("content");

  const onSubmit = async (data: FormData) => {
    if (isLinkDialogOpen) return;

    try {
      const template = await createTemplate.mutateAsync(data);
      onSave(template);
      toast.success("Template created successfully");
      onClose();
    } catch (_error) {
      toast.error("Failed to create template");
    }
  };

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="data-[side=right]:w-[800px] data-[side=right]:sm:max-w-[800px] h-[100dvh] p-0">
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
