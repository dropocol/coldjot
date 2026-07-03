"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Mail, X } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Mailbox } from "@prisma/client";

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
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleGmailSignIn = async () => {
    try {
      setIsLoading(true);
      // Start Gmail OAuth flow
      const response = await fetch("/api/mailboxes/gmail/auth", {
        method: "POST",
      });

      if (!response.ok) throw new Error("Failed to start Gmail authentication");

      const { url } = await response.json();
      window.location.href = url;
    } catch (_error) {
      toast({
        title: "Error",
        description: "Failed to start Gmail authentication",
        variant: "destructive",
      });
      setIsLoading(false);
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
