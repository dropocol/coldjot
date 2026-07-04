"use client";

import { useState, useEffect } from "react";
import { Button } from "@coldjot/ui/components/button";
import { useToast } from "@coldjot/ui/hooks/use-toast";
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
  const { toast } = useToast();

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

      toast({
        title: "Sequence Updated",
        description: `Sequence ${action} successfully`,
      });
    } catch (_error) {
      toast({
        title: "Error",
        description: `Failed to ${action} sequence`,
        variant: "destructive",
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
