"use client";

import { useState, useEffect } from "react";
import { Button } from "@coldjot/ui/components/button";
import { toast } from "sonner";
import { PlayIcon, PauseIcon } from "lucide-react";
import { SequenceStatus } from "@coldjot/types";
import { useSequenceControl } from "@/hooks/queries/use-sequences";

interface SequenceControlsProps {
  sequenceId: string;
  initialStatus: SequenceStatus;
  onStatusChange: (newStatus: SequenceStatus) => void;
}

export function SequenceControls({
  sequenceId,
  initialStatus,
  onStatusChange,
}: SequenceControlsProps) {
  const [status, setStatus] = useState<SequenceStatus>(initialStatus);
  const control = useSequenceControl(sequenceId);
  // toast() is now imported from sonner;

  useEffect(() => {
    setStatus(initialStatus);
  }, [initialStatus]);

  const handleControl = async (action: SequenceStatus.ACTIVE | SequenceStatus.PAUSED) => {
    try {
      await control.mutateAsync(action);

      const newStatus =
        action === SequenceStatus.PAUSED
          ? SequenceStatus.PAUSED
          : SequenceStatus.ACTIVE;
      setStatus(newStatus);
      onStatusChange(newStatus);

      toast.success("Sequence Updated", {
        description: `Sequence ${action} successfully`,
      });
    } catch (_error) {
      toast.error("Error", {
        description: `Failed to ${action} sequence`,
      });
    }
  };

  // Only show controls for active or paused sequences
  if (status !== SequenceStatus.ACTIVE && status !== SequenceStatus.PAUSED) {
    return null;
  }

  return (
    <Button
      variant="outline"
      size="default"
      onClick={() =>
        handleControl(
          status === SequenceStatus.ACTIVE
            ? SequenceStatus.PAUSED
            : SequenceStatus.ACTIVE
        )
      }
      disabled={control.isPending}
      className="min-w-[100px]"
    >
      {status === SequenceStatus.ACTIVE ? (
        <>
          <PauseIcon className="h-4 w-4 mr-2" />
          Pause Sequence
        </>
      ) : (
        <>
          <PlayIcon className="h-4 w-4 mr-2" />
          Resume Sequence
        </>
      )}
    </Button>
  );
}
