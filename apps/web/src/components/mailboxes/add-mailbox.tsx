"use client";

import { Button } from "@coldjot/ui";
import { useToast } from "@coldjot/ui";
import { Mail, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@coldjot/ui";
import type { Mailbox } from "@prisma/client";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";

interface AddEmailAccountProps {
  onClose: () => void;
  onAccountAdded: (account: Mailbox) => void;
  showCloseButton?: boolean;
}

export function AddMailbox({
  onClose,
  onAccountAdded: _onAccountAdded,
  showCloseButton = false,
}: AddEmailAccountProps) {
  const { toast } = useToast();
  const gmailAuth = useMutation({
    mutationFn: () => api.post<{ url: string }>("/api/mailboxes/gmail/auth", {}),
  });
  const isLoading = gmailAuth.isPending;

  const handleGmailSignIn = async () => {
    try {
      const { url } = await gmailAuth.mutateAsync();
      window.location.href = url;
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to start Gmail authentication",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader className="relative">
        {showCloseButton && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-4 top-4"
            onClick={onClose}
            disabled={isLoading}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
        <h3 className="text-lg font-medium">Add Mailbox</h3>
        <p className="text-sm text-muted-foreground">
          Connect your Gmail account to send emails from different addresses
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Button
            className="w-full"
            onClick={handleGmailSignIn}
            disabled={isLoading}
          >
            <Mail className="w-4 h-4 mr-2" />
            {isLoading ? "Connecting..." : "Sign in with Gmail"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
