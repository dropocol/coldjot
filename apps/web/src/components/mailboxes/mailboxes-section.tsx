"use client";

import { useState } from "react";
import { Button } from "@coldjot/ui/components/button";
import { Plus } from "lucide-react";
import { Separator } from "@coldjot/ui/components/separator";
import { MailboxList, type MailboxWithAliases } from "./mailbox-list";
import { AddMailbox } from "./add-mailbox";
import type { Mailbox } from "@coldjot/database";
import { startMailboxWatch, stopMailboxWatch } from "@/lib/api/mailbox";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";

interface MailboxesSectionProps {
  initialAccounts: MailboxWithAliases[];
}

export function MailboxesSection({ initialAccounts }: MailboxesSectionProps) {
  const [isAddingAccount, setIsAddingAccount] = useState(
    initialAccounts.length === 0
  );
  const [accounts, setAccounts] =
    useState<MailboxWithAliases[]>(initialAccounts);
  const qc = useQueryClient();

  // Per-call mutations (id is passed per-call, not baked into the hook).
  const updateMailbox = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Partial<Mailbox>;
    }) => api.patch<MailboxWithAliases>(`/api/mailboxes/${id}`, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mailboxes.all }),
  });
  const deleteMailbox = useMutation({
    mutationFn: (id: string) => api.delete<null>(`/api/mailboxes/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mailboxes.all }),
  });
  const refreshAliases = useMutation({
    mutationFn: (id: string) =>
      api.post<MailboxWithAliases>(`/api/mailboxes/${id}/aliases/refresh`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.mailboxes.all }),
  });

  const handleAccountUpdate = async (
    accountId: string,
    data: Partial<Mailbox>
  ) => {
    const updatedAccount = await updateMailbox.mutateAsync({
      id: accountId,
      data,
    });
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === accountId
          ? (updatedAccount as MailboxWithAliases)
          : account
      )
    );
  };

  const handleAccountDelete = async (accountId: string) => {
    await deleteMailbox.mutateAsync(accountId);
    setAccounts((prev) => prev.filter((account) => account.id !== accountId));

    // Show add account form if no accounts left
    if (accounts.length === 1) {
      setIsAddingAccount(true);
    }
  };

  const handleAliasesRefresh = async (accountId: string) => {
    const updatedAccount = await refreshAliases.mutateAsync(accountId);
    setAccounts((prev) =>
      prev.map((account) =>
        account.id === accountId
          ? (updatedAccount as MailboxWithAliases)
          : account
      )
    );
  };

  const handleWatchUpdate = async (email: string, action: "start" | "stop") => {
    // Find the account with the matching email to get its userId
    const account = accounts.find((acc) => acc.email === email);
    if (!account) {
      throw new Error("Account not found");
    }

    if (action === "start") {
      await startMailboxWatch(account.userId, email);
    } else {
      await stopMailboxWatch(email);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Mailboxes</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your Gmail account to send emails from different addresses.
          </p>
        </div>
        {accounts.length > 0 && (
          <Button
            onClick={() => setIsAddingAccount(true)}
            disabled={isAddingAccount}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        )}
      </div>

      {accounts.length > 0 && <Separator />}

      <div className="space-y-4">
        {isAddingAccount && (
          <AddMailbox
            onClose={() => setIsAddingAccount(false)}
            onAccountAdded={(account) => {
              setAccounts((prev) => [...prev, account as MailboxWithAliases]);
              setIsAddingAccount(false);
            }}
            showCloseButton={accounts.length > 0}
          />
        )}

        {accounts.length > 0 && (
          <MailboxList
            accounts={accounts}
            onAccountUpdate={handleAccountUpdate}
            onAccountDelete={handleAccountDelete}
            onAliasesRefresh={handleAliasesRefresh}
            onWatchUpdate={handleWatchUpdate}
          />
        )}
      </div>
    </div>
  );
}
