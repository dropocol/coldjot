"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

import { BusinessHoursSettings } from "@/components/sequences/business-hours-settings";
import { SequenceEmailSettings } from "@/components/sequences/sequence-email-settings";
import type { MailboxWithRequired } from "@/components/sequences/sequence-email-settings";
import { toast } from "react-hot-toast";
import type {
  BusinessHours,
  BusinessScheduleType,
} from "@coldjot/types";
import { SequenceDangerZone } from "@/components/sequences/sequence-danger-zone";
import { useMailboxes } from "@/hooks/queries/use-mailboxes";
import { useUpdateSequenceSettings } from "@/hooks/queries/use-sequences";

interface SequenceSettingsProps {
  sequence: {
    id: string;
    name: string;
    accessLevel: "team" | "private";
    scheduleType: BusinessScheduleType;
    businessHours?: BusinessHours;
    testMode: boolean;
    disableSending: boolean;
    testEmails: string[];
    mailboxId?: string | null;
    sequenceMailbox: {
      id: string;
      mailboxId: string;
      aliasId: string | null;
    } | null;
  };
}

export function SequenceSettings({ sequence }: SequenceSettingsProps) {
  const router = useRouter();
  const [name, setName] = useState(sequence.name);
  const updateSettings = useUpdateSequenceSettings(sequence.id);
  const isSaving = updateSettings.isPending;

  const { data: mailboxData } = useMailboxes<{
    id: string;
    email: string;
    name?: string | null;
    aliases?: unknown;
  }>();
  // Ensure required fields are present
  const mailboxes = (mailboxData ?? []).map(
    (m) =>
      ({
        id: m.id,
        email: m.email,
        name: m.name || null,
        aliases: m.aliases,
      }) as MailboxWithRequired
  );

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({ name });
      toast.success("Settings updated successfully");
      router.refresh();
    } catch (_error) {
      toast.error("Failed to update settings");
    }
  };

  return (
    <div className="space-y-8">
      {/* General Settings */}
      <div className="space-y-8">
        <div className="border-b pb-3">
          <h3 className="text-lg font-semibold">General Settings</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Basic settings for your sequence including name and other general
            configurations.
          </p>
        </div>

        <div className="flex items-center justify-between">
          <Label>Sequence Name</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Business Hours Settings */}
      <BusinessHoursSettings
        sequenceId={sequence.id}
        initialSettings={sequence.businessHours}
        scheduleType={sequence.scheduleType}
      />

      {/* Email Settings */}
      <SequenceEmailSettings
        sequenceId={sequence.id}
        initialSettings={{
          testMode: sequence.testMode ?? false,
          disableSending: sequence.disableSending ?? false,
          testEmails: sequence.testEmails ?? [],
          sequenceMailbox: sequence.sequenceMailbox,
        }}
        mailboxes={mailboxes}
      />

      {/* Danger Zone */}
      <SequenceDangerZone
        sequenceId={sequence.id}
        onStatusChange={() => {
          router.refresh();
        }}
      />
    </div>
  );
}
