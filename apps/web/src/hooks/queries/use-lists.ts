"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk, type ListParams } from "@/lib/query/keys";
import type { UpdateListInput } from "@/lib/schemas";
import type { Contact, EmailList } from "@coldjot/types";

/** Response shape of GET /api/lists. */
export interface ListsListResponse {
  lists: EmailList[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
}

/** Pagination block attached to GET /api/lists/[id]. */
interface ListDetailPagination {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
}

/** Response shape of GET /api/lists/[id]. */
export interface ListDetailResponse extends EmailList {
  contacts: Contact[];
  _pagination: ListDetailPagination;
}

function listsQueryString(params: ListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit));
  if (params.search) qs.set("q", params.search);
  return qs.toString();
}

export function useLists(params: ListParams) {
  return useQuery({
    queryKey: qk.lists.list(params),
    queryFn: () =>
      api.get<ListsListResponse>(`/api/lists?${listsQueryString(params)}`),
  });
}

export function useListDetail(
  id: string,
  params: ListParams,
  options?: { enabled?: boolean }
) {
  return useQuery({
    queryKey: qk.lists.detail(id),
    queryFn: () =>
      api.get<ListDetailResponse>(
        `/api/lists/${id}?${listsQueryString(params)}`
      ),
    enabled: (options?.enabled ?? true) && !!id,
  });
}

export function useCreateList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      name: string;
      description?: string | null;
      tags?: string[];
    }) => api.post<EmailList>("/api/lists", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lists.all }),
  });
}

export function useUpdateList(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateListInput) =>
      api.patch<EmailList>(`/api/lists/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.lists.detail(id) });
      qc.invalidateQueries({ queryKey: qk.lists.all });
    },
  });
}

export function useDeleteList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: true }>(`/api/lists/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.lists.all }),
  });
}

/** Add a single contact to a list (POST /api/lists/[id]/contacts). */
export function useAddContactToList(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactId: string) =>
      api.post<{ success: true }>(`/api/lists/${id}/contacts`, { contactId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.lists.detail(id) });
      qc.invalidateQueries({ queryKey: qk.lists.contacts(id) });
    },
  });
}

/**
 * Bulk-add contacts to a list (PUT /api/lists/[id]/contacts, body
 * `{ contactIds }`). The endpoint filters out ids already present and
 * triggers a sync. Returns 409 if all contacts already exist.
 */
export function useAddContactsToList(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api.put<{
        message?: string;
        added?: number;
        skipped?: number;
        total?: number;
      }>(`/api/lists/${id}/contacts`, { contactIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.lists.detail(id) });
      qc.invalidateQueries({ queryKey: qk.lists.contacts(id) });
    },
  });
}

/**
 * Remove contacts from a list (DELETE /api/lists/[id]/contacts).
 * The endpoint takes a body `{ contactIds: string[] }` (validated against
 * setListContactsSchema) and filters those ids out of the current set.
 */
export function useRemoveContactsFromList(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api.delete<{ success: true; removed: number }>(`/api/lists/${id}/contacts`, {
        contactIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.lists.detail(id) });
      qc.invalidateQueries({ queryKey: qk.lists.contacts(id) });
    },
  });
}
