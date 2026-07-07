"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/http/api-client";
import { qk } from "@/lib/query/keys";
import type {
  BlockedTemplate,
  BulkDeleteTemplatesResult,
  ListParams,
  PaginatedResponse,
  Template,
  TemplateInUseError,
} from "@coldjot/types";

export type TemplatesListResponse = PaginatedResponse<"templates", Template>;

/**
 * Error thrown by the template delete hooks when one or more templates are in
 * active use (HTTP 409). One shape serves both single and bulk delete — the
 * bulk path carries the full list, the single path wraps its one entry.
 */
export interface TemplateInUseMutationError {
  status: 409;
  blocked: true;
  blockedTemplates: BlockedTemplate[];
}

/**
 * Runtime type guard for the 409 mutation error. `instanceof` can't be used
 * (the error is a thrown plain object, not a class instance), so callers narrow
 * with this instead. Works for both single and bulk delete.
 */
export function isTemplateInUseError(
  e: unknown
): e is TemplateInUseMutationError {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as { status?: number }).status === 409 &&
    (e as { blocked?: boolean }).blocked === true
  );
}

/**
 * Shape the 409 body thrown by the HTTP client into the typed mutation error.
 * Non-409 errors are rethrown unchanged.
 */
function shapeBlockedError(err: unknown): never {
  if (err instanceof ApiError && err.status === 409) {
    const body = err.body as TemplateInUseError;
    throw {
      status: 409,
      blocked: true,
      blockedTemplates: body?.blockedTemplates ?? [],
    } satisfies TemplateInUseMutationError;
  }
  throw err;
}

function qs(params: ListParams): string {
  const s = new URLSearchParams();
  s.set("page", String(params.page));
  s.set("limit", String(params.limit));
  if (params.search) s.set("q", params.search);
  return s.toString();
}

export function useTemplates(params: ListParams) {
  return useQuery({
    queryKey: qk.templates.list(params),
    queryFn: () =>
      api.get<TemplatesListResponse>(`/api/templates?${qs(params)}`),
  });
}

export function useTemplate(id: string) {
  return useQuery({
    // GET /api/templates/[id] returns the bare template.
    queryKey: qk.templates.detail(id),
    queryFn: () => api.get<Template>(`/api/templates/${id}`),
    enabled: !!id,
  });
}

/** Free-text template search; endpoint returns a bare array. */
export function useTemplateSearch(query: string) {
  return useQuery({
    queryKey: qk.templates.search(query),
    queryFn: () =>
      api.get<Template[]>(`/api/templates/search?q=${encodeURIComponent(query)}`),
    enabled: query.trim().length > 0,
  });
}

export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    // POST returns the bare created template.
    mutationFn: (input: {
      name: string;
      subject: string;
      content: string;
    }) => api.post<Template>("/api/templates", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates.all }),
  });
}

export function useUpdateTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Template>) =>
      api.put<Template>(`/api/templates/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.templates.detail(id) });
      qc.invalidateQueries({ queryKey: qk.templates.all });
    },
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation<null, TemplateInUseMutationError, string>({
    mutationFn: async (id: string) => {
      try {
        await api.delete<null>(`/api/templates/${id}`);
        return null;
      } catch (err) {
        shapeBlockedError(err);
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates.all }),
  });
}

/**
 * Bulk delete templates (POST /api/templates/bulk-delete, body
 * { templateIds, mode? }). Defaults to soft-delete on the backend. On a 200 the
 * result can be *partial* (some soft-deleted, some blocked); a 409 means every
 * id was blocked. Cache is invalidated only when something was actually deleted.
 */
export function useBulkDeleteTemplates() {
  const qc = useQueryClient();
  return useMutation<
    BulkDeleteTemplatesResult,
    TemplateInUseMutationError,
    { templateIds: string[]; mode?: "soft" | "hard" }
  >({
    mutationFn: async ({ templateIds, mode }) => {
      try {
        return await api.post<BulkDeleteTemplatesResult>(
          "/api/templates/bulk-delete",
          mode ? { templateIds, mode } : { templateIds }
        );
      } catch (err) {
        shapeBlockedError(err);
      }
    },
    onSuccess: (data) => {
      // Only refetch when something actually changed — an all-blocked 409
      // throws before reaching here, so this guards the partial-success case.
      if (data.deleted > 0) {
        qc.invalidateQueries({ queryKey: qk.templates.all });
      }
    },
  });
}
