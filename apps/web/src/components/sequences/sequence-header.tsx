"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SequenceStatusBadge } from "@/components/sequences/sequence-status-badge";
import { SequenceControls } from "@/components/sequences/sequence-controls";
import { SequenceNav } from "@/components/sequences/sequence-nav";
import { LaunchSequenceModal } from "@/components/sequences/launch-sequence-modal";
import { SequenceSetupChecklist } from "@/components/sequences/sequence-setup-checklist";
import { SequenceStatus } from "@coldjot/types";
import { isSequenceReadyToLaunch } from "@/lib/sequence-utils";
import { Sparkles } from "lucide-react";

interface SequenceHeaderProps {
  sequence: {
    id: string;
    name: string;
    status: SequenceStatus;
    contactCount: number;
    testMode?: boolean;
    disabledSending?: boolean;
    steps?: any[];
    businessHours?: any;
    _count?: {
      contacts: number;
    };
  };
}

export function SequenceHeader({ sequence }: SequenceHeaderProps) {
  const router = useRouter();
  const [showLaunchModal, setShowLaunchModal] = useState(false);

  // Only check readiness for draft sequences to avoid unnecessary calculations
  const isDraft = sequence.status === SequenceStatus.DRAFT;
  const { isReady } = isDraft
    ? isSequenceReadyToLaunch(sequence)
    : { isReady: false };

  return (
    <>
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold">{sequence.name}</h2>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <SequenceStatusBadge status={sequence.status} />
            <span>•</span>
            <span>
              {sequence._count?.contacts || sequence.contactCount} contacts
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          {isDraft && isReady && (
            <Button
              variant="default"
              className="gap-2"
              onClick={() => setShowLaunchModal(true)}
            >
              <Sparkles className="h-4 w-4" />
              Launch Sequence
            </Button>
          )}

          <SequenceControls
            sequenceId={sequence.id}
            initialStatus={sequence.status}
            onStatusChange={() => {
              router.refresh();
            }}
          />
        </div>
      </div>

      {isDraft && (
        <div className="mt-6 mb-6 max-w-5xl mx-auto">
          <SequenceSetupChecklist sequence={sequence as any} />
        </div>
      )}

      <SequenceNav sequenceId={sequence.id} />

      <LaunchSequenceModal
        open={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        sequenceId={sequence.id}
        contactCount={sequence._count?.contacts || sequence.contactCount}
        testMode={sequence.testMode || false}
        onStatusChange={() => {
          router.refresh();
        }}
      />
    </>
  );
}
