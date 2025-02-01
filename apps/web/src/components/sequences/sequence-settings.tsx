"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from "@/components/ui/card";
import { BusinessHoursSettings } from "@/components/sequences/business-hours-settings";
import { SequenceEmailSettings } from "@/components/sequences/sequence-email-settings";
import type { MailboxWithRequired } from "@/components/sequences/sequence-email-settings";
import { toast } from "react-hot-toast";
import type {
  BusinessHours,
  BusinessScheduleEnum,
  BusinessScheduleType,
} from "@coldjot/types";
import { SequenceDangerZone } from "@/components/sequences/sequence-danger-zone";
import { Separator } from "@radix-ui/react-separator";

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
  const [isSaving, setIsSaving] = useState(false);
  const [mailboxes, setMailboxes] = useState<MailboxWithRequired[]>([]);
  const [isLoadingMailboxes, setIsLoadingMailboxes] = useState(true);

  useEffect(() => {
    const fetchMailboxes = async () => {
      try {
        const response = await fetch("/api/mailboxes");
        if (!response.ok) throw new Error("Failed to fetch mailboxes");
        const data = await response.json();
        // Ensure required fields are present
        const mailboxesWithRequired = data.map((m: any) => ({
          id: m.id,
          email: m.email,
          name: m.name || null,
          aliases: m.aliases,
        }));
        setMailboxes(mailboxesWithRequired);
      } catch (error) {
        console.error("Failed to fetch mailboxes:", error);
        toast.error("Failed to load mailboxes");
      } finally {
        setIsLoadingMailboxes(false);
      }
    };

    fetchMailboxes();
  }, []);

  const handleSave = async () => {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/sequences/${sequence.id}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
        }),
      });

      if (!response.ok) throw new Error("Failed to update sequence");

      toast.success("Settings updated successfully");
      router.refresh();
    } catch (error) {
      toast.error("Failed to update settings");
    } finally {
      setIsSaving(false);
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
