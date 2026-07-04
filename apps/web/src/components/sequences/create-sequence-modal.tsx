"use client";

import { useForm } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@coldjot/ui";
import { Button } from "@coldjot/ui";
import { Input } from "@coldjot/ui";
import { Label } from "@coldjot/ui";

import { toast } from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { useCreateSequence } from "@/hooks/queries/use-sequences";

interface FormData {
  name: string;
  permissions: string;
  schedule: string;
}

interface CreateSequenceModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateSequenceModal({
  open,
  onClose,
  onSuccess,
}: CreateSequenceModalProps) {
  const createSequence = useCreateSequence();
  const isSubmitting = createSequence.isPending;
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>();

  const onSubmit = async (data: FormData) => {
    try {
      await createSequence.mutateAsync({
        name: data.name,
        permissions: data.permissions as "team" | "private",
        schedule: data.schedule as "business" | "custom",
      });
      toast.success("Sequence created successfully");
      onSuccess();
      onClose();
    } catch (_error) {
      toast.error("Failed to create sequence");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>New Sequence</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Sequence Name</Label>
                <Input
                  id="name"
                  {...register("name", {
                    required: "Sequence name is required",
                  })}
                  placeholder="Enter sequence name"
                />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Back
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
