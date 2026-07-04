"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { toast } from "sonner";

import { useRouter } from "next/navigation";
import { SequenceStatus } from "@coldjot/types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@coldjot/ui/components/alert-dialog";
import { useResetSequence, useDeleteSequence } from "@/hooks/queries/use-sequences";

interface SequenceDangerZoneProps {
  sequenceId: string;
  onStatusChange?: (newStatus: SequenceStatus) => void;
}

export function SequenceDangerZone({ sequenceId, onStatusChange }: SequenceDangerZoneProps) {
  // toast() is now imported from sonner;
  const router = useRouter();
  const reset = useResetSequence(sequenceId);
  const deleteSequence = useDeleteSequence();
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const isLoading = reset.isPending || deleteSequence.isPending;

  const handleReset = async () => {
    try {
      await reset.mutateAsync();

      onStatusChange?.(SequenceStatus.DRAFT);

      toast.success("Success", { description: "Sequence has been reset successfully" });

      router.refresh();
    } catch (_error) {
      toast.error("Error", { description: "Failed to reset sequence" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteSequence.mutateAsync(sequenceId);

      toast.success("Success", { description: "Sequence has been deleted successfully" });

      router.push("/sequences");
    } catch (_error) {
      toast.error("Error", { description: "Failed to delete sequence" });
      setIsDeleteDialogOpen(false);
    }
  };

  return (
    <div className="space-y-8 pt-8">
      <div className="border-b pb-3">
        <h3 className="text-lg font-semibold text-destructive">Danger Zone</h3>
        <p className="text-sm text-muted-foreground mt-1">
          These actions are irreversible. Please be certain before proceeding.
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="text-sm font-medium">Reset Sequence</h5>
            <p className="text-sm text-muted-foreground">
              Reset the sequence to its initial state. This will clear all progress and allow you to
              launch the sequence again.
            </p>
          </div>
          <Button
            variant="outline"
            className="text-destructive min-w-40 border-destructive hover:text-destructive/90 hover:bg-destructive/10"
            onClick={handleReset}
            disabled={isLoading}
          >
            Reset Sequence
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4">
          <div>
            <h5 className="text-sm font-medium">Delete Sequence</h5>
            <p className="text-sm text-muted-foreground">
              Permanently delete this sequence and all its data. This action cannot be undone.
            </p>
          </div>

          <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
            <AlertDialogTrigger
              render={<Button variant="destructive" className="min-w-40" disabled={isLoading} />}
            >
              Delete Sequence
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the sequence and all
                  associated data, including:
                </AlertDialogDescription>
                <div className="mt-4">
                  <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                    <li>All sequence contacts and their progress</li>
                    <li>All sequence steps and templates</li>
                    <li>All sequence settings and configurations</li>
                    <li>All related analytics and tracking data</li>
                  </ul>
                </div>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={isLoading}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isLoading ? "Deleting..." : "Yes, delete sequence"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}
