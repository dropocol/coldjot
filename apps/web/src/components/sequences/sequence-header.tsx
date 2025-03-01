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
import { Sparkles, RefreshCw, MailX, TestTube } from "lucide-react";
import { useSequence } from "@/lib/sequence-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { PlayCircle } from "lucide-react";

export function SequenceHeader() {
  const router = useRouter();
  const { sequence, refreshSequence, isRefreshing } = useSequence();
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
            {sequence.disableSending && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="bg-amber-50 text-amber-700 border-amber-200 flex items-center gap-1 px-2"
                    >
                      <MailX className="h-3 w-3" />
                      <span>Sending Disabled</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Email sending is currently disabled for this sequence</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {sequence.testMode && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1 px-2"
                    >
                      <TestTube className="h-3 w-3" />
                      <span>Test Mode</span>
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Emails will only be sent to test recipients</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <span>•</span>
            <span>
              {sequence._count?.contacts || sequence.contactCount} contacts
            </span>
          </div>
        </div>
        <div className="flex gap-3">
          {isDraft && (
            <Button
              variant="outline"
              size="icon"
              onClick={refreshSequence}
              disabled={isRefreshing}
              title="Refresh sequence status"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </Button>
          )}

          {isDraft && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant="default"
                      className="gap-2"
                      onClick={() => setShowLaunchModal(true)}
                      disabled={!isReady || isRefreshing}
                    >
                      <Sparkles className="h-4 w-4" />
                      Launch Sequence
                    </Button>
                  </div>
                </TooltipTrigger>
                {!isReady && (
                  <TooltipContent className="max-w-xs">
                    <p>Complete all setup steps to enable launching</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          )}

          <SequenceControls
            sequenceId={sequence.id}
            initialStatus={sequence.status}
            onStatusChange={() => {
              refreshSequence();
              router.refresh();
            }}
          />
        </div>
      </div>

      <SequenceNav sequenceId={sequence.id} />

      {isDraft && (
        <div className="mt-6 mb-6 max-w-5xl mx-auto">
          <SequenceSetupChecklist
            sequence={sequence as any}
            onStepComplete={refreshSequence}
          />
        </div>
      )}

      <LaunchSequenceModal
        open={showLaunchModal}
        onClose={() => setShowLaunchModal(false)}
        sequenceId={sequence.id}
        contactCount={sequence._count?.contacts || sequence.contactCount}
        testMode={sequence.testMode || false}
        onStatusChange={(newStatus) => {
          // Update local sequence status via context
          refreshSequence();
          router.refresh();
        }}
      />
    </>
  );
}
