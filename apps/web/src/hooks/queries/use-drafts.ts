"use client";

import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";

export interface Draft {
  id: string;
  [key: string]: unknown;
}

/** Create a Gmail draft (POST /api/drafts). Returns the bare draft row. */
export function useCreateDraft() {
  return useMutation({
    mutationFn: (input: {
      contactId: string;
      templateId?: string | null;
      content: string;
    }) => api.post<Draft>("/api/drafts", input),
  });
}

/** Send a draft (POST /api/drafts/send). */
export function useSendDraft() {
  return useMutation({
    mutationFn: (draftId: string) =>
      api.post<{ success: true }>("/api/drafts/send", { draftId }),
  });
}
