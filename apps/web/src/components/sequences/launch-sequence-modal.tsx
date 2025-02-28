"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, AlertCircle, Loader2, Sparkles } from "lucide-react";
import { SequenceStatus } from "@coldjot/types";
import {
  isSequenceReadyToLaunch,
  invalidateSequenceCache,
} from "@/lib/sequence-utils";

interface LaunchSequenceModalProps {
  open: boolean;
  onClose: () => void;
  sequenceId: string;
  contactCount: number;
  testMode: boolean;
  onStatusChange?: (newStatus: SequenceStatus) => void;
}

export function LaunchSequenceModal({
  open,
  onClose,
  sequenceId,
  contactCount,
  testMode,
  onStatusChange,
}: LaunchSequenceModalProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // We'll fetch the sequence data when needed
  const [sequence, setSequence] = useState<any>(null);
  const [isLoadingSequence, setIsLoadingSequence] = useState(false);

  // Reset sequence data when modal closes
  useEffect(() => {
    if (!open) {
      setSequence(null);
    }
  }, [open]);

  // Fetch sequence data when modal opens
  useEffect(() => {
    const fetchSequenceData = async () => {
      if (!open || sequence) return;

      try {
        setIsLoadingSequence(true);
        const response = await fetch(`/api/sequences/${sequenceId}`);
        if (response.ok) {
          const data = await response.json();
          setSequence(data);
        }
      } catch (error) {
        console.error("Error fetching sequence data:", error);
      } finally {
        setIsLoadingSequence(false);
      }
    };

    fetchSequenceData();
  }, [open, sequenceId, sequence]);

  // Get sequence setup status
  const { steps, isReady } = sequence
    ? isSequenceReadyToLaunch(sequence)
    : {
        isReady: false,
        steps: {
          hasSteps: false,
          hasContacts: contactCount > 0,
          hasBusinessHours: false,
          hasMailbox: false,
        },
      };

  const handleLaunch = async () => {
    if (!isReady) {
      toast({
        title: "Cannot Launch Sequence",
        description: "Please complete all setup steps before launching.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch(`/api/sequences/${sequenceId}/launch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          testMode,
        }),
      });

      if (!response.ok) throw new Error("Failed to launch sequence");

      // Invalidate the cache for this sequence
      invalidateSequenceCache(sequenceId);

      onStatusChange?.(SequenceStatus.ACTIVE);
      onClose();
      toast({
        title: "Sequence Launched",
        description: "Your sequence has been launched successfully",
      });
    } catch (error) {
      console.error("Error launching sequence:", error);
      toast({
        title: "Error",
        description: "Failed to launch sequence",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Launch Sequence</DialogTitle>
          <DialogDescription>
            Review your sequence settings before launching
          </DialogDescription>
        </DialogHeader>

        {isLoadingSequence ? (
          <div className="py-8 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Loading sequence data...
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Contact Count Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <h4 className="text-sm font-medium">Contacts to process</h4>
                  <p className="text-sm text-muted-foreground">
                    {contactCount} contact{contactCount !== 1 ? "s" : ""} will
                    be processed
                  </p>
                </div>
              </div>
            </div>

            <Separator />

            {/* Test Mode Info */}
            {testMode && (
              <>
                <Alert
                  variant="default"
                  className="bg-yellow-50 border-yellow-200"
                >
                  <AlertDescription className="text-yellow-600">
                    Test Mode is enabled. Emails will only be sent to test
                    recipients.
                  </AlertDescription>
                </Alert>
                <Separator />
              </>
            )}

            {/* Pre-launch Checklist */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium">Pre-launch checklist</h4>
              <div className="rounded-md border p-4 space-y-3">
                <ChecklistItem
                  title="Sequence Steps"
                  description="Your sequence has steps configured"
                  isCompleted={steps.hasSteps}
                  setupLink={`/sequences/${sequenceId}`}
                />
                <ChecklistItem
                  title="Contacts Added"
                  description={`${contactCount} contact${contactCount !== 1 ? "s" : ""} will receive this sequence`}
                  isCompleted={steps.hasContacts}
                  setupLink={`/sequences/${sequenceId}/contacts`}
                />
                <ChecklistItem
                  title="Business Hours"
                  description="Emails will be sent during your configured business hours"
                  isCompleted={steps.hasBusinessHours}
                  setupLink={`/sequences/${sequenceId}/settings`}
                />
                <ChecklistItem
                  title="Mailbox Connected"
                  description="Your emails will be sent from your connected mailbox"
                  isCompleted={steps.hasMailbox}
                  setupLink={`/sequences/${sequenceId}/settings`}
                />
              </div>

              {isReady ? (
                <div className="flex items-center justify-center gap-2 p-3 bg-green-50 rounded-md border border-green-100 mt-3">
                  <Sparkles className="h-4 w-4 text-green-500" />
                  <p className="text-sm text-green-700 font-medium">
                    Your sequence is ready to launch!
                  </p>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground mt-2">
                  <p>Complete all steps above to enable the Launch button.</p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handleLaunch}
                disabled={isLoading || !isReady}
                className={`min-w-[100px] ${isReady ? "bg-green-600 hover:bg-green-700" : ""}`}
              >
                {isLoading ? "Launching..." : "Launch"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface ChecklistItemProps {
  title: string;
  description: string;
  isCompleted: boolean;
  setupLink?: string;
}

function ChecklistItem({
  title,
  description,
  isCompleted,
  setupLink,
}: ChecklistItemProps) {
  return (
    <div className="flex items-start space-x-3">
      <div className="mt-0.5">
        {isCompleted ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <AlertCircle className="h-5 w-5 text-amber-500" />
        )}
      </div>
      <div className="space-y-1 flex-1">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium">{title}</h4>
          {!isCompleted && setupLink && (
            <Button variant="link" size="sm" className="h-auto p-0" asChild>
              <a href={setupLink}>Setup</a>
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
