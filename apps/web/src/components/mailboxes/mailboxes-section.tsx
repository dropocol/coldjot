"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { MailboxList } from "./mailbox-list";
import { AddMailbox } from "./add-mailbox";
import type { Mailbox, EmailAlias } from "@coldjot/database";

interface MailboxWithAliases extends Mailbox {
  aliases: EmailAlias[];
}

interface MailboxesSectionProps {
  initialAccounts: MailboxWithAliases[];
}

export function MailboxesSection({ initialAccounts }: MailboxesSectionProps) {
  const [isAddingAccount, setIsAddingAccount] = useState(
    initialAccounts.length === 0
  );
  const [accounts, setAccounts] =
    useState<MailboxWithAliases[]>(initialAccounts);

  const handleAccountUpdate = async (
    accountId: string,
    data: Partial<Mailbox>
  ) => {
    try {
      const response = await fetch(`/api/mailboxes/${accountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error("Failed to update account");

      const updatedAccount: MailboxWithAliases = await response.json();
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId ? updatedAccount : account
        )
      );
    } catch (error) {
      console.error("[EMAIL_ACCOUNTS_UPDATE]", error);
      throw error;
    }
  };

  const handleAccountDelete = async (accountId: string) => {
    try {
      const response = await fetch(`/api/mailboxes/${accountId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete account");

      setAccounts((prev) => prev.filter((account) => account.id !== accountId));

      // Show add account form if no accounts left
      if (accounts.length === 1) {
        setIsAddingAccount(true);
      }
    } catch (error) {
      console.error("[EMAIL_ACCOUNTS_DELETE]", error);
      throw error;
    }
  };

  const handleAliasesRefresh = async (accountId: string) => {
    try {
      const response = await fetch(
        `/api/mailboxes/${accountId}/aliases/refresh`,
        {
          method: "POST",
        }
      );

      if (!response.ok) throw new Error("Failed to refresh aliases");

      const updatedAccount: MailboxWithAliases = await response.json();
      setAccounts((prev) =>
        prev.map((account) =>
          account.id === accountId ? updatedAccount : account
        )
      );
    } catch (error) {
      console.error("[EMAIL_ACCOUNTS_REFRESH_ALIASES]", error);
      throw error;
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
          />
        )}
      </div>
    </div>
  );
}
