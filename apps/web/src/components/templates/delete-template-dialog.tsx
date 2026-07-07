"use client";

import { useState } from "react";
import { Template } from "@coldjot/types";
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
import { toast } from "sonner";
import {
  isTemplateInUseError,
  useDeleteTemplate,
} from "@/hooks/queries/use-templates";

interface Props {
  template: Template;
  onClose: () => void;
  onDelete: (id: string) => void;
}

export default function DeleteTemplateDialog({
  template,
  onClose,
  onDelete,
}: Props) {
  const deleteTemplate = useDeleteTemplate();
  const [blocked, setBlocked] = useState(false);
  const [blockedSequences, setBlockedSequences] = useState<
    { id: string; name: string; status: string }[]
  >([]);

  const handleDelete = async () => {
    try {
      await deleteTemplate.mutateAsync(template.id);
      onDelete(template.id);
      toast.success("Template moved to trash.");
    } catch (error) {
      // 409 → swap to the blocked view so the user can see which sequences
      // are using the template. Do NOT close the dialog or call onDelete.
      if (isTemplateInUseError(error)) {
        const seqs = error.blockedTemplates?.[0]?.sequences ?? [];
        setBlockedSequences(seqs);
        setBlocked(true);
        return;
      }
      toast.error("Failed to delete template");
    }
  };

  return (
    <AlertDialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <AlertDialogContent>
        {blocked ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Cannot delete &quot;{template.name}&quot;
              </AlertDialogTitle>
              <AlertDialogDescription>
                This template is in use by an active or paused sequence. Pause
                or detach the template from the sequence before deleting it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
              {blockedSequences.map((s) => (
                <li key={s.id}>
                  <span className="text-foreground">{s.name}</span> ({s.status})
                </li>
              ))}
            </ul>
            <AlertDialogFooter>
              <AlertDialogAction onClick={onClose}>Close</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Move Template to Trash?</AlertDialogTitle>
              <AlertDialogDescription>
                Move &quot;{template.name}&quot; to trash? It will be hidden
                from your templates, but sequences already using it will keep
                working until you detach it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleteTemplate.isPending}
              >
                {deleteTemplate.isPending ? "Deleting..." : "Move to trash"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}
