"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk, type ListParams } from "@/lib/query/keys";
import type { EmailList } from "@coldjot/types";

/** Response shape of GET /api/sequences/[id]/lists. */
export interface SequenceListsResponse {
  lists: EmailList[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
}

function invalidateSequenceLists(
  qc: ReturnType<typeof useQueryClient>,
  sequenceId: string
) {
  qc.invalidateQueries({ queryKey: qk.sequences.lists(sequenceId) });
}

function qs(params: ListParams): string {
  const s = new URLSearchParams();
  s.set("page", String(params.page));
  s.set("limit", String(params.limit));
  if (params.search) s.set("q", params.search);
  return s.toString();
}

export function useSequenceLists(
  sequenceId: string,
  params: ListParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: qk.sequences.lists(sequenceId, params),
    queryFn: () =>
      api.get<SequenceListsResponse>(
        `/api/sequences/${sequenceId}/lists?${qs(params)}`
      ),
    enabled: (options?.enabled ?? true) && !!sequenceId,
  });
}

/** Attach a list to a sequence (POST /api/sequences/[id]/lists, body { listId }). */
export function useAddListToSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) =>
      api.post<{ success: true }>(`/api/sequences/${sequenceId}/lists`, {
        listId,
      }),
    onSuccess: () => invalidateSequenceLists(qc, sequenceId),
  });
}

/** Detach a list from a sequence (DELETE /api/sequences/[id]/lists/[listId]). */
export function useRemoveListFromSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) =>
      api.delete<{ success: true }>(
        `/api/sequences/${sequenceId}/lists/${listId}`
      ),
    onSuccess: () => invalidateSequenceLists(qc, sequenceId),
  });
}

/**
 * Sync a list's contacts into the sequence
 * (POST /api/sequences/[id]/lists/[listId]/sync).
 */
export function useSyncListInSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listId: string) =>
      api.post<{ success: true; message: string; added: number }>(
        `/api/sequences/${sequenceId}/lists/${listId}/sync`,
        {}
      ),
    onSuccess: () => {
      invalidateSequenceLists(qc, sequenceId);
      // Sync adds contacts to the sequence, so refresh those too.
      qc.invalidateQueries({ queryKey: qk.sequences.contacts(sequenceId) });
    },
  });
}
