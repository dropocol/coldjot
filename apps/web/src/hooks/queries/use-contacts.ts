"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";
import type { BulkDeleteMode, ListParams } from "@coldjot/types";
import type {
  CreateContactInput,
  UpdateContactInput,
} from "@coldjot/types/schemas";
import type {
  Contact,
  PaginatedResponse,
} from "@coldjot/types";

/** Response shape of GET /api/contacts. */
export type ContactsListResponse = PaginatedResponse<"contacts", Contact>;

function contactsQueryString(params: ListParams): string {
  const qs = new URLSearchParams();
  qs.set("page", String(params.page));
  qs.set("limit", String(params.limit));
  if (params.search) qs.set("q", params.search);
  return qs.toString();
}

export function useContacts(params: ListParams) {
  return useQuery({
    queryKey: qk.contacts.list(params),
    queryFn: () =>
      api.get<ContactsListResponse>(
        `/api/contacts?${contactsQueryString(params)}`
      ),
  });
}

export function useContact(id: string) {
  return useQuery({
    // GET /api/contacts/[id] returns the bare contact object.
    queryKey: qk.contacts.detail(id),
    queryFn: () => api.get<Contact>(`/api/contacts/${id}`),
    enabled: !!id,
  });
}

export function useCreateContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateContactInput) =>
      // POST /api/contacts returns the bare created contact.
      api.post<Contact>("/api/contacts", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}

/** Bulk-create contacts (POST /api/contacts/batch, body { contacts }). */
export function useBatchCreateContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contacts: CreateContactInput[]) =>
      api.post<{ success: true; imported: number; skipped: number }>(
        "/api/contacts/batch",
        { contacts }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}

export function useUpdateContact(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateContactInput) =>
      api.put<Contact>(`/api/contacts/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.contacts.detail(id) });
      qc.invalidateQueries({ queryKey: qk.contacts.all });
    },
  });
}

export function useDeleteContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ success: true }>(`/api/contacts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}

/**
 * Bulk-delete contacts (soft by default, or hard/purge).
 * - mode: "soft" (default) → move to trash (reversible via useRestoreContacts).
 * - mode: "hard"           → PERMANENTLY DELETE the contacts + all their
 *   analytics, events, tracking, threads, enrollments. Irreversible.
 *
 * On success, invalidates the contacts query cache so lists refresh.
 */
export function useBulkDeleteContacts() {
  const qc = useQueryClient();
  return useMutation({
    // Default to soft at the call site too (defensive — the route also defaults).
    mutationFn: (input: { contactIds: string[]; mode?: BulkDeleteMode }) =>
      api.post<{ success: boolean; deleted: number; mode: BulkDeleteMode }>(
        "/api/contacts/bulk-delete",
        { contactIds: input.contactIds, mode: input.mode ?? "soft" }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}

/**
 * Restore previously soft-deleted contacts (flip deletedAt → null).
 * Only meaningful after a soft delete; hard-purged contacts are gone.
 */
export function useRestoreContacts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (contactIds: string[]) =>
      api.post<{ success: boolean; restored: number }>(
        "/api/contacts/restore",
        { contactIds }
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.contacts.all }),
  });
}

/**
 * Free-text contact search (used by compose/search dropdowns).
 * The endpoint returns all matches; the hook gates on a non-empty query.
 */
export function useContactSearch(query: string) {
  return useQuery({
    // GET /api/contacts/search returns a bare array.
    queryKey: qk.contacts.search(query),
    queryFn: () =>
      api.get<Contact[]>(`/api/contacts/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
}
