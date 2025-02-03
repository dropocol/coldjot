"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mail } from "lucide-react";
import { CreateSequenceModal } from "./create-sequence-modal";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { SequenceStatusBadge } from "@/components/sequences/sequence-status-badge";
import { SequenceControls } from "@/components/sequences/sequence-controls";
import { SequenceStatus } from "@coldjot/types";

interface Sequence {
  id: string;
  name: string;
  status: SequenceStatus;
  accessLevel: string;
  scheduleType: string;
  steps: any[];
  _count: {
    contacts: number;
  };
}

interface SequenceListProps {
  initialSequences: Sequence[];
  showCreateModal: boolean;
  onCloseCreateModal: () => void;
  onAddSequence?: () => void;
}

export function SequenceList({
  initialSequences,
  showCreateModal,
  onCloseCreateModal,
  onAddSequence,
}: SequenceListProps) {
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences);
  const [showStepEditor, setShowStepEditor] = useState(false);
  const [selectedSequence, setSelectedSequence] = useState<Sequence | null>(
    null
  );
  const router = useRouter();

  const handleCreateSuccess = async () => {
    try {
      const response = await fetch("/api/sequences");
      if (!response.ok) throw new Error("Failed to fetch sequences");
      const data = await response.json();
      setSequences(data);
      onCloseCreateModal();
      toast.success("Sequence created successfully");
      router.refresh();
    } catch (error) {
      toast.error("Failed to refresh sequences");
    }
  };

  const handleStepSave = (stepData: any) => {
    setShowStepEditor(false);
    // Handle step save logic here
  };

  return (
    <div className="space-y-6">
      {sequences.length === 0 ? (
        <div className="text-center py-12">
          <div className="flex justify-center mb-4">
            <Mail className="h-12 w-12 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">
            Create your first sequence
          </h3>
          <p className="text-muted-foreground mb-4">
            Build custom campaigns to automate emails, set more meetings, and
            convert more customers.
          </p>
          <Button onClick={onAddSequence}>Create a sequence</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {sequences.map((sequence) => (
            <SequenceListItem key={sequence.id} sequence={sequence} />
          ))}
        </div>
      )}

      <CreateSequenceModal
        open={showCreateModal}
        onClose={onCloseCreateModal}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

function SequenceListItem({ sequence }: { sequence: Sequence }) {
  const [status, setStatus] = useState<SequenceStatus>(sequence.status);

  const handleStatusChange = (newStatus: SequenceStatus) => {
    setStatus(newStatus);
  };

  return (
    <div className="p-0">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">{sequence.name}</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SequenceStatusBadge status={status} />
            <span>•</span>
            <span>{sequence._count.contacts} contacts</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SequenceControls
            sequenceId={sequence.id}
            initialStatus={status}
            onStatusChange={handleStatusChange}
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/sequences/${sequence.id}`}>View</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
