"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/http/api-client";
import { qk, type ListParams } from "@/lib/query/keys";
import type { Template } from "@coldjot/types";

export interface TemplatesListResponse {
  templates: Template[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
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
  return useMutation({
    mutationFn: (id: string) =>
      api.delete<null>(`/api/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.templates.all }),
  });
}
