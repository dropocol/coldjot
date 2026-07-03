"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk, type ListParams } from "@/lib/query/keys";
import type {
  CreateContactInput,
  UpdateContactInput,
} from "@/lib/schemas";
import type { Contact } from "@coldjot/types";

/** Response shape of GET /api/contacts. */
export interface ContactsListResponse {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
}

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
