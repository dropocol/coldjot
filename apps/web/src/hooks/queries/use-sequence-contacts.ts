"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";
import type { SequenceContact } from "@coldjot/types";

/** Response shape of GET /api/sequences/[id]/contacts. */
export interface SequenceContactsResponse {
  contacts: SequenceContact[];
  totalSteps: number;
  total: number;
}

function invalidateContacts(
  qc: ReturnType<typeof useQueryClient>,
  sequenceId: string
) {
  // Broad: refresh every page of this sequence's contacts + the detail's
  // contact-count readiness.
  qc.invalidateQueries({ queryKey: ["sequences", sequenceId, "contacts"] });
  qc.invalidateQueries({ queryKey: qk.sequences.detail(sequenceId) });
}

export function useSequenceContacts(
  sequenceId: string,
  params?: { page: number; limit: number },
  options?: { enabled?: boolean; refetchInterval?: number | false }
) {
  return useQuery({
    queryKey: qk.sequences.contacts(sequenceId, params),
    queryFn: () => {
      if (params) {
        const qs = new URLSearchParams();
        qs.set("page", String(params.page));
        qs.set("limit", String(params.limit));
        return api.get<SequenceContactsResponse>(
          `/api/sequences/${sequenceId}/contacts?${qs.toString()}`
        );
      }
      return api.get<SequenceContactsResponse>(
        `/api/sequences/${sequenceId}/contacts`
      );
    },
    enabled: (options?.enabled ?? true) && !!sequenceId,
    refetchInterval: options?.refetchInterval ?? false,
  });
}

/** Add a single contact to a sequence (POST returns the enriched contact). */
export function useAddContactToSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      api.post<SequenceContact>(`/api/sequences/${sequenceId}/contacts`, {
        contactId,
      }),
    onSuccess: () => invalidateContacts(qc, sequenceId),
  });
}

/** Remove a contact from a sequence (DELETE returns { success }). */
export function useRemoveContactFromSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      api.delete<{ success: true }>(
        `/api/sequences/${sequenceId}/contacts/${contactId}`
      ),
    onSuccess: () => invalidateContacts(qc, sequenceId),
  });
}

/** Bulk-add contacts to a sequence (POST /api/sequences/[id]/contacts/bulk). */
export function useBulkAddContactsToSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api.post<{ message: string; added?: number; skipped?: number }>(
        `/api/sequences/${sequenceId}/contacts/bulk`,
        { contactIds }
      ),
    onSuccess: () => invalidateContacts(qc, sequenceId),
  });
}

/** Add every contact from one or more lists (POST .../contacts/list). */
export function useAddListContactsToSequence(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listIds: string[]) =>
      api.post<{ message: string; added?: number; skipped?: number }>(
        `/api/sequences/${sequenceId}/contacts/list`,
        { listIds }
      ),
    onSuccess: () => invalidateContacts(qc, sequenceId),
  });
}

/** Send a step immediately to a contact (POST .../send-now). */
export function useSendContactStepNow(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contactId }: { contactId: string }) =>
      api.post<SequenceContact>(
        `/api/sequences/${sequenceId}/contacts/${contactId}/send-now`,
        {}
      ),
    onSuccess: () => invalidateContacts(qc, sequenceId),
  });
}

/**
 * Manually set a contact's enrollment status (POST .../status).
 * `status` must be a `SequenceContactStatusEnum` value.
 */
export function useUpdateContactStatus(sequenceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      contactId,
      status,
    }: {
      contactId: string;
      status: string;
    }) =>
      api.post<SequenceContact>(
        `/api/sequences/${sequenceId}/contacts/${contactId}/status`,
        { status }
      ),
    onSuccess: () => invalidateContacts(qc, sequenceId),
  });
}
