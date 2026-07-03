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
} from "@/components/ui/alert-dialog";
import { toast } from "react-hot-toast";

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
  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/templates/${template.id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete template");

      onDelete(template.id);
      toast.success("Template deleted successfully");
    } catch (_error) {
      toast.error("Failed to delete template");
    }
  };

  return (
    <AlertDialog open onOpenChange={onClose}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Template</AlertDialogTitle>
          <AlertDialogDescription>
            Are you sure you want to delete &quot;{template.name}&quot;? This
            action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
