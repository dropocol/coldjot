"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export function SettingsMessageHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // toast() is now imported from sonner;

  useEffect(() => {
    const success = searchParams.get("success");
    const error = searchParams.get("error");

    if (success || error) {
      // Show toast message
      if (success) {
        toast.success("Success", {
          description: "Gmail account connected successfully",
        });
      } else {
        toast.error("Error", {
          description:
            error === "gmail_auth_failed"
              ? "Failed to connect Gmail account"
              : "Invalid request",
        });
      }

      // Remove query parameters
      router.replace("/settings");
    }
  }, [searchParams, router]);

  return null;
}
