"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";

/**
 * The mailbox list (GET /api/mailboxes returns a bare array).
 * `Mailbox`/`Account` shapes vary; callers that need strong typing can cast at
 * the boundary. We keep this loose to avoid coupling to Prisma internals.
 */
export function useMailboxes<T = unknown>() {
  return useQuery({
    queryKey: qk.mailboxes.all,
    queryFn: () => api.get<T[]>("/api/mailboxes"),
  });
}

export function useMailboxCount() {
  return useQuery({
    queryKey: qk.mailboxes.count,
    queryFn: () => api.get<{ count: number }>("/api/mailboxes/count"),
  });
}

export function useMailbox<T = unknown>(id: string) {
  return useQuery({
    // GET /api/mailboxes/[mailboxId] returns the bare account object.
    queryKey: qk.mailboxes.detail(id),
    queryFn: () => api.get<T>(`/api/mailboxes/${id}`),
    enabled: !!id,
  });
}

export function useDeleteMailbox() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<null>(`/api/mailboxes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.mailboxes.all });
      qc.invalidateQueries({ queryKey: qk.mailboxes.count });
    },
  });
}

export function useUpdateMailbox(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.patch<unknown>(`/api/mailboxes/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.mailboxes.detail(id) });
      qc.invalidateQueries({ queryKey: qk.mailboxes.all });
    },
  });
}

/** Refresh Gmail aliases (POST /api/mailboxes/[id]/aliases/refresh). */
export function useRefreshMailboxAliases(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<unknown>(`/api/mailboxes/${id}/aliases/refresh`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.mailboxes.detail(id) });
      qc.invalidateQueries({ queryKey: qk.mailboxes.all });
    },
  });
}
