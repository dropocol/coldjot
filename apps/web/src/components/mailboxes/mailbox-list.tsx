"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Mail,
  MoreVertical,
  RefreshCw,
  Trash2,
  Bell,
  BellOff,
  Power,
  PowerOff,
} from "lucide-react";
import { Mailbox, EmailAlias } from "@coldjot/database";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";

export type MailboxWithAliases = Mailbox & {
  aliases: EmailAlias[];
};

interface MailboxListProps {
  accounts: MailboxWithAliases[];
  onAccountUpdate: (accountId: string, data: Partial<Mailbox>) => Promise<void>;
  onAccountDelete: (accountId: string) => Promise<void>;
  onAliasesRefresh: (accountId: string) => Promise<void>;
  onWatchUpdate?: (email: string, action: "start" | "stop") => Promise<void>;
}

// Feature flag for watch controls
// const ENABLE_WATCH_CONTROLS =
//   process.env.NEXT_PUBLIC_ENABLE_WATCH_CONTROLS === "true";

const ENABLE_WATCH_CONTROLS = true;

export function MailboxList({
  accounts,
  onAccountUpdate,
  onAccountDelete,
  onAliasesRefresh,
  onWatchUpdate,
}: MailboxListProps) {
  const { toast } = useToast();
  const [expandedAccounts, setExpandedAccounts] = useState<
    Record<string, boolean>
  >({});

  const handleToggleExpand = (accountId: string) => {
    setExpandedAccounts((prev) => ({
      ...prev,
      [accountId]: !prev[accountId],
    }));
  };

  const handleRefreshAliases = async (accountId: string) => {
    try {
      await onAliasesRefresh(accountId);
      toast({
        title: "Aliases refreshed",
        description: "Your email aliases have been updated.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to refresh aliases. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleWatchUpdate = async (email: string, action: "start" | "stop") => {
    try {
      if (!onWatchUpdate) return;

      // Find the account with the matching email to get its userId
      const account = accounts.find((acc) => acc.email === email);
      if (!account) {
        throw new Error("Account not found");
      }

      await onWatchUpdate(email, action);
      toast({
        title: action === "start" ? "Watch Started" : "Watch Stopped",
        description: `Email watch has been ${action === "start" ? "started" : "stopped"} for ${email}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to ${action} watch. Please try again.`,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {accounts.map((account) => {
        return (
          <div
            key={account.id}
            className="rounded-lg border bg-card text-card-foreground shadow-sm"
          >
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center space-x-4">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <span className="font-medium">
                      {account.name || account.email}
                    </span>
                    {!account.isActive && (
                      <span className="rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                        Inactive
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {account.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {account.provider === "gmail" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRefreshAliases(account.id)}
                    title="Refresh Aliases"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleExpand(account.id)}
                  title={
                    expandedAccounts[account.id]
                      ? "Hide Aliases"
                      : "Show Aliases"
                  }
                >
                  {expandedAccounts[account.id] ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onClick={() =>
                        onAccountUpdate(account.id, {
                          isActive: !account.isActive,
                        })
                      }
                    >
                      {account.isActive ? (
                        <PowerOff className="mr-2 h-4 w-4" />
                      ) : (
                        <Power className="mr-2 h-4 w-4" />
                      )}
                      {account.isActive ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    {ENABLE_WATCH_CONTROLS && account.provider === "gmail" && (
                      <>
                        <DropdownMenuItem
                          onClick={() =>
                            handleWatchUpdate(account.email, "stop")
                          }
                        >
                          <BellOff className="mr-2 h-4 w-4" />
                          Stop Email Watch
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            handleWatchUpdate(account.email, "start")
                          }
                        >
                          <Bell className="mr-2 h-4 w-4" />
                          New Email Watch
                        </DropdownMenuItem>
                      </>
                    )}
                    <DropdownMenuItem
                      onClick={() => onAccountDelete(account.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Remove Account
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {expandedAccounts[account.id] && (
              <div className="border-t p-4">
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Aliases</h4>
                  {account.aliases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No aliases found
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {account.aliases.map((alias) => (
                        <div
                          key={alias.id}
                          className="flex items-center justify-between rounded-md border p-2"
                        >
                          <div>
                            <div className="font-medium">
                              {alias.name || alias.alias}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {alias.alias}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
