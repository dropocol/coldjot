"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@coldjot/ui/hooks/use-toast";

export function SettingsMessageHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success || error) {
      // Show toast message
      toast({
        title: success ? "Success" : "Error",
        description: success
          ? "Gmail account connected successfully"
          : error === "gmail_auth_failed"
            ? "Failed to connect Gmail account"
            : "Invalid request",
        variant: success ? "default" : "destructive",
      });

      // Remove query parameters
      router.replace("/settings");
    }
  }, [searchParams, router, toast]);

  return null;
}
