"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";
import type {
  CreateSequenceInput,
  ListParams,
  PaginatedResponse,
  Sequence,
  SequenceStatus,
} from "@coldjot/types";

/** Response shape of GET /api/sequences. */
export type SequencesListResponse = PaginatedResponse<"sequences", Sequence>;

function sequencesQueryString(params: ListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit));
  if (params.search) qs.set("q", params.search);
  return qs.toString();
}

export function useSequences(params: ListParams) {
  return useQuery({
    queryKey: qk.sequences.list(params),
    queryFn: () =>
      api.get<SequencesListResponse>(
        `/api/sequences?${sequencesQueryString(params)}`
      ),
  });
}

/**
 * Full sequence detail (steps, businessHours, sequenceMailbox, _count.contacts).
 * The `/api/sequences/[id]` GET returns the bare sequence object.
 *
 * Pass `initialData` (e.g. from a server component) to hydrate the first paint.
 */
export function useSequenceDetail(
  id: string,
  options?: { enabled?: boolean; initialData?: Sequence }
) {
  return useQuery({
    queryKey: qk.sequences.detail(id),
    queryFn: () => api.get<Sequence>(`/api/sequences/${id}`),
    enabled: (options?.enabled ?? true) && !!id,
    initialData: options?.initialData,
  });
}

export function useCreateSequence() {
  const qc = useQueryClient();
  return useMutation({
    // POST /api/sequences returns the bare created sequence.
    mutationFn: (input: CreateSequenceInput) =>
      api.post<Sequence>("/api/sequences", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sequences.all }),
  });
}

export function useDeleteSequence() {
  const qc = useQueryClient();
  return useMutation({
    // DELETE returns 204 No Content.
    mutationFn: (id: string) => api.delete<null>(`/api/sequences/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sequences.all }),
  });
}

export function useDuplicateSequence(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Sequence>(`/api/sequences/${id}/duplicate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sequences.all }),
  });
}

/**
 * Set a sequence's status via the control endpoint.
 * `action` is the raw SequenceStatus value (`"active"` or `"paused"`) — the
 * route rejects anything else.
 */
export function useSequenceControl(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: SequenceStatus.ACTIVE | SequenceStatus.PAUSED) =>
      api.post<Sequence>(`/api/sequences/${id}/control`, { action }),
    onSuccess: (sequence) => {
      qc.setQueryData(qk.sequences.detail(id), sequence);
      qc.invalidateQueries({ queryKey: qk.sequences.detail(id) });
    },
  });
}

/** Launch a sequence (POST /api/sequences/[id]/launch). */
export function useLaunchSequence(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (testMode: boolean) =>
      api.post<{ success: true; jobId: string; contactCount: number; stepCount: number }>(
        `/api/sequences/${id}/launch`,
        { testMode }
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sequences.detail(id) });
    },
  });
}

/** Reset a sequence (POST /api/sequences/[id]/reset). */
export function useResetSequence(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<{ success: true; message: string }>(`/api/sequences/${id}/reset`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.sequences.detail(id) });
      qc.invalidateQueries({ queryKey: qk.sequences.contacts(id) });
    },
  });
}

/** Save sequence settings (PATCH /api/sequences/[id]/settings). */
export function useUpdateSequenceSettings(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      api.patch<Sequence>(`/api/sequences/${id}/settings`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.sequences.detail(id) }),
  });
}

/**
 * Optimistically patch the cached sequence detail. Used by the `useSequence`
 * shim to mirror the old context's `updateSequence` / `updateReadinessField`
 * local mutations without a full refetch.
 */
export function useOptimisticSequenceUpdate(id: string) {
  const qc = useQueryClient();
  return {
    patch(partial: Partial<Sequence>) {
      qc.setQueryData<Sequence>(qk.sequences.detail(id), (old) =>
        old ? { ...old, ...partial } : old
      );
    },
    setStatus(status: SequenceStatus) {
      this.patch({ status });
    },
  };
}
