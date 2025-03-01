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
import { isSequenceReadyToLaunch } from "@/lib/sequence-utils";
import { useSequence } from "@/lib/sequence-context";

interface LaunchSequenceModalProps {
  open: boolean;
  onClose: () => void;
  sequenceId?: string;
  contactCount?: number;
  testMode?: boolean;
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
  const { sequence, refreshSequence } = useSequence();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Use context values if props are not provided
  const actualSequenceId = sequenceId || sequence.id;
  const actualContactCount =
    contactCount || sequence._count?.contacts || sequence.contactCount || 0;
  const actualTestMode =
    testMode !== undefined ? testMode : sequence.testMode || false;

  // Get sequence setup status
  const { steps, isReady } = isSequenceReadyToLaunch(sequence);

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
      const response = await fetch(
        `/api/sequences/${actualSequenceId}/launch`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            testMode: actualTestMode,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.log("Error launching sequence:", errorData.error);

        toast({
          title: "An Error Occurred",
          description: errorData.message,
          variant: "destructive",
        });
        return;
      }

      // Call the onStatusChange callback if provided
      onStatusChange?.(SequenceStatus.ACTIVE);

      // Refresh the sequence data
      await refreshSequence();

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

        <div className="space-y-6">
          {/* Contact Count Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h4 className="text-sm font-medium">Contacts to process</h4>
                <p className="text-sm text-muted-foreground">
                  {actualContactCount} contact
                  {actualContactCount !== 1 ? "s" : ""} will be processed
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={refreshSequence}
                className="h-8 px-2"
              >
                Refresh
              </Button>
            </div>
          </div>

          <Separator />

          {/* Test Mode Info */}
          {actualTestMode && (
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
            <div className="space-y-2">
              <div className="flex items-start">
                {steps.hasSteps ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">Sequence steps</p>
                  <p className="text-xs text-muted-foreground">
                    {steps.hasSteps
                      ? "Steps have been added to your sequence"
                      : "Add at least one step to your sequence"}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                {steps.hasContacts ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">Contacts</p>
                  <p className="text-xs text-muted-foreground">
                    {steps.hasContacts
                      ? `${actualContactCount} contact${
                          actualContactCount !== 1 ? "s" : ""
                        } added`
                      : "Add contacts to your sequence"}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                {steps.hasBusinessHours ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">Business hours</p>
                  <p className="text-xs text-muted-foreground">
                    {steps.hasBusinessHours
                      ? "Business hours have been set"
                      : "Set business hours for your sequence"}
                  </p>
                </div>
              </div>

              <div className="flex items-start">
                {steps.hasMailbox ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 mr-2 flex-shrink-0" />
                )}
                <div>
                  <p className="text-sm font-medium">Mailbox</p>
                  <p className="text-xs text-muted-foreground">
                    {steps.hasMailbox
                      ? "Mailbox has been attached"
                      : "Attach a mailbox to your sequence"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleLaunch}
              // disabled={isLoading || !isReady}
              className="gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Launch Sequence
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
