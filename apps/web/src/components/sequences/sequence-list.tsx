"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Plus, Mail, Settings } from "lucide-react";
import { CreateSequenceModal } from "./create-sequence-modal";
import { useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import Link from "next/link";
import { SequenceStatusBadge } from "@/components/sequences/sequence-status-badge";
import { SequenceControls } from "@/components/sequences/sequence-controls";

interface Sequence {
  id: string;
  name: string;
  status: string;
  accessLevel: string;
  scheduleType: string;
  steps: any[];
  _count: {
    contacts: number;
  };
}

interface SequenceListProps {
  initialSequences: Sequence[];
}

export function SequenceList({ initialSequences }: SequenceListProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showStepEditor, setShowStepEditor] = useState(false);
  const [sequences, setSequences] = useState<Sequence[]>(initialSequences);
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
      setShowCreateModal(false);
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
      <div className="flex justify-end">
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Sequence
        </Button>
      </div>

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
          <Button onClick={() => setShowCreateModal(true)}>
            Create a sequence
          </Button>
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
        onClose={() => setShowCreateModal(false)}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

function SequenceListItem({ sequence }: { sequence: Sequence }) {
  return (
    <div className="p-4 border rounded-lg">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">{sequence.name}</h3>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SequenceStatusBadge status={sequence.status} />
            <span>•</span>
            <span>{sequence._count.contacts} contacts</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SequenceControls
            sequenceId={sequence.id}
            initialStatus={sequence.status}
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/sequences/${sequence.id}`}>View</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}