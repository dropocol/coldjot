"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EmailAlias } from "@coldjot/types";
import { attachMailbox, updateSequenceSettings } from "@/lib/client-actions";
import { useSequence } from "@/lib/sequence-context";

// Use a more specific type for our needs
export interface MailboxWithRequired {
  id: string;
  email: string;
  name: string | null;
  aliases?: EmailAlias[];
}

interface SequenceMailbox {
  id: string;
  mailboxId: string;
  aliasId: string | null;
}

interface SequenceEmailSettingsState {
  testMode: boolean;
  disableSending: boolean;
  testEmails: string[];
  sequenceMailbox: SequenceMailbox | null;
}

interface SequenceEmailSettingsProps {
  sequenceId: string;
  initialSettings: {
    testMode: boolean;
    disableSending: boolean;
    testEmails: string[];
    sequenceMailbox: SequenceMailbox | null;
  };
  mailboxes: MailboxWithRequired[];
}

export function SequenceEmailSettings({
  sequenceId,
  initialSettings,
  mailboxes,
}: SequenceEmailSettingsProps) {
  const [settings, setSettings] = useState<SequenceEmailSettingsState>({
    testMode: initialSettings?.testMode ?? false,
    disableSending: initialSettings?.disableSending ?? false,
    testEmails: initialSettings?.testEmails ?? [],
    sequenceMailbox: initialSettings?.sequenceMailbox ?? null,
  });
  const [newEmail, setNewEmail] = useState("");
  const { toast } = useToast();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const { updateReadinessField, updateSequence } = useSequence();

  // Find the selected mailbox and alias
  const selectedMailbox = mailboxes.find(
    (mailbox) => mailbox.id === settings.sequenceMailbox?.mailboxId
  );
  const selectedAlias = selectedMailbox?.aliases?.find(
    (alias) => alias.id === settings.sequenceMailbox?.aliasId
  );

  const handleMailboxChange = async (mailboxId: string) => {
    try {
      setIsLoading(true);

      // Use the client action instead of direct fetch
      const data = await attachMailbox(
        sequenceId,
        {
          mailboxId,
          aliasId: null, // Reset alias when mailbox changes
        },
        updateReadinessField
      );

      setSettings((prev) => ({
        ...prev,
        sequenceMailbox: data.sequenceMailbox,
      }));

      toast({
        title: "Mailbox updated",
        description: "The sequence mailbox has been updated",
      });
    } catch (error) {
      console.error("Error updating mailbox:", error);
      toast({
        title: "Error",
        description: "Failed to update sequence mailbox",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAliasChange = async (value: string) => {
    try {
      setIsLoading(true);

      // Use the client action instead of direct fetch
      const data = await attachMailbox(
        sequenceId,
        {
          mailboxId: settings.sequenceMailbox?.mailboxId || "",
          aliasId: value === "default" ? null : value,
        },
        updateReadinessField
      );

      setSettings((prev) => ({
        ...prev,
        sequenceMailbox: data.sequenceMailbox,
      }));

      toast({
        title: "Alias updated",
        description: "The email alias has been updated",
      });
    } catch (error) {
      console.error("Error updating alias:", error);
      toast({
        title: "Error",
        description: "Failed to update email alias",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestModeChange = async (checked: boolean) => {
    try {
      setIsLoading(true);

      // Use the client action instead of direct fetch
      await updateSequenceSettings(
        sequenceId,
        { testMode: checked },
        updateSequence
      );

      // Update local state
      setSettings((prev) => ({ ...prev, testMode: checked }));

      toast({
        title: "Success",
        description: "Test mode updated successfully",
      });
    } catch (error) {
      console.error("Error updating test mode:", error);
      toast({
        title: "Error",
        description: "Failed to update test mode",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisableSendingChange = async (checked: boolean) => {
    try {
      setIsLoading(true);

      // Use the client action instead of direct fetch
      await updateSequenceSettings(
        sequenceId,
        { disableSending: checked },
        updateSequence
      );

      // Update local state
      setSettings((prev) => ({ ...prev, disableSending: checked }));

      toast({
        title: "Success",
        description: "Email sending settings updated successfully",
      });
    } catch (error) {
      console.error("Error updating sending settings:", error);
      toast({
        title: "Error",
        description: "Failed to update email sending settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveTestEmails = async (emails: string[]) => {
    try {
      setIsLoading(true);

      // Use the client action instead of direct fetch
      await updateSequenceSettings(
        sequenceId,
        { testEmails: emails },
        updateSequence
      );

      toast({
        title: "Success",
        description: "Test email added successfully",
      });

      return true;
    } catch (error) {
      console.error("Error saving test emails:", error);
      toast({
        title: "Error",
        description: "Failed to save test emails",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEmail = async () => {
    if (!newEmail || !newEmail.includes("@")) return;

    const updatedEmails = [...settings.testEmails, newEmail];
    const success = await saveTestEmails(updatedEmails);

    if (success) {
      setSettings((prev) => ({
        ...prev,
        testEmails: updatedEmails,
      }));
      setNewEmail("");
    }
  };

  const handleRemoveEmail = async (email: string) => {
    const updatedEmails = settings.testEmails.filter((e) => e !== email);
    const success = await saveTestEmails(updatedEmails);

    if (success) {
      setSettings((prev) => ({
        ...prev,
        testEmails: updatedEmails,
      }));
    }
  };

  return (
    <div className="space-y-8">
      <div className="border-b pb-3">
        <h3 className="text-lg font-semibold">Email Settings</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Configure email sending settings and test mode options.
        </p>
      </div>

      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <Label>Sending Mailbox</Label>
              <div className="text-sm text-muted-foreground mb-2">
                Select the mailbox to use for sending sequence emails
              </div>
            </div>
            <Select
              value={settings.sequenceMailbox?.mailboxId || undefined}
              onValueChange={handleMailboxChange}
              disabled={isLoading || mailboxes.length === 0}
            >
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder="Select a mailbox">
                  {selectedMailbox
                    ? selectedMailbox.name
                      ? `${selectedMailbox.name} (${selectedMailbox.email})`
                      : selectedMailbox.email
                    : "Select a mailbox"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {mailboxes.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No mailboxes available
                  </div>
                ) : (
                  mailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.name
                        ? `${mailbox.name} (${mailbox.email})`
                        : mailbox.email}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          {selectedMailbox &&
            selectedMailbox.aliases &&
            selectedMailbox.aliases.length > 0 && (
              <div className="flex justify-between items-center mt-4">
                <div>
                  <Label>Email Alias</Label>
                  <div className="text-sm text-muted-foreground mb-2">
                    Select an alias to use for sending emails (optional)
                  </div>
                </div>
                <Select
                  value={settings.sequenceMailbox?.aliasId || "default"}
                  onValueChange={handleAliasChange}
                  disabled={isLoading}
                >
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Select an alias">
                      {selectedAlias
                        ? selectedAlias.name
                          ? `${selectedAlias.name} (${selectedAlias.alias})`
                          : selectedAlias.alias
                        : "Use default email"}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Use default email</SelectItem>
                    {selectedMailbox.aliases.map((alias) => (
                      <SelectItem key={alias.id} value={alias.id}>
                        {alias.name
                          ? `${alias.name} (${alias.alias})`
                          : alias.alias}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

          {!settings.sequenceMailbox?.mailboxId && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>
                {mailboxes.length === 0
                  ? "No mailboxes available. Please add a mailbox in settings first."
                  : "Please select a mailbox to send emails from"}
              </AlertDescription>
            </Alert>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Test Mode</Label>
              <div className="text-sm text-muted-foreground">
                Send emails to test recipients only
              </div>
            </div>
            <Switch
              checked={settings.testMode}
              onCheckedChange={handleTestModeChange}
              disabled={isLoading}
            />
          </div>

          {settings.testMode && (
            <Alert variant="default" className="bg-yellow-50 border-yellow-200">
              <AlertDescription className="text-yellow-600">
                Emails will only be sent to test recipients for testing purposes
              </AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Disable Email Sending</Label>
            <div className="text-sm text-muted-foreground">
              Emails won't be sent but will be logged in the console
            </div>
          </div>
          <Switch
            checked={settings.disableSending}
            onCheckedChange={handleDisableSendingChange}
            disabled={isLoading}
          />
        </div>

        <Separator />

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="space-y-1">
              <Label>Test Recipient Emails</Label>
              <div className="text-sm text-muted-foreground">
                Emails will be sent to these addresses in test mode
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddEmail()}
                disabled={isLoading}
              />
              <Button onClick={handleAddEmail} disabled={isLoading}>
                {isLoading ? "Adding..." : "Add"}
              </Button>
            </div>

            <div className="space-y-2 mt-4">
              {settings.testEmails.map((email) => (
                <div
                  key={email}
                  className="flex items-center justify-between p-2 rounded-md border bg-muted/40"
                >
                  <span className="text-sm">{email}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveEmail(email)}
                    disabled={isLoading}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
