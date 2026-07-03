/**
 * Centralized, hierarchical react-query key factory.
 *
 * Convention: every key is a readonly tuple. Invalidation is targeted via the
 * most specific key you have, or broad via the resource root:
 *   qc.invalidateQueries({ queryKey: qk.contacts.all })      // refresh all contact queries
 *   qc.invalidateQueries({ queryKey: qk.contacts.detail(id) }) // refresh one contact
 *
 * Because react-query matches by prefix, invalidating `qk.contacts.all` (the
 * tuple `["contacts"]`) also invalidates `["contacts","list",...]` and
 * `["contacts","detail",...]`.
 */

export interface ListParams {
  page: number;
  limit: number;
  search?: string;
}

function searchParam(params: ListParams): string {
  // Normalize so `{page:1,limit:20,search:"a"}` and `{search:"a",page:1,limit:20}`
  // produce identical keys.
  const { page, limit, search } = params;
  return search ? `${page}:${limit}:${search}` : `${page}:${limit}`;
}

export const qk = {
  contacts: {
    all: ["contacts"] as const,
    list: (params: ListParams) =>
      ["contacts", "list", searchParam(params)] as const,
    detail: (id: string) => ["contacts", "detail", id] as const,
    search: (q: string) => ["contacts", "search", q] as const,
  },
  lists: {
    all: ["lists"] as const,
    list: (params: ListParams) => ["lists", "list", searchParam(params)] as const,
    detail: (id: string) => ["lists", "detail", id] as const,
    contacts: (id: string) => ["lists", id, "contacts"] as const,
  },
  sequences: {
    all: ["sequences"] as const,
    list: (params: ListParams) =>
      ["sequences", "list", searchParam(params)] as const,
    detail: (id: string) => ["sequences", "detail", id] as const,
    steps: (id: string) => ["sequences", id, "steps"] as const,
    contacts: (id: string, params?: ListParams) =>
      params
        ? (["sequences", id, "contacts", searchParam(params)] as const)
        : (["sequences", id, "contacts"] as const),
    lists: (id: string, params?: ListParams) =>
      params
        ? (["sequences", id, "lists", searchParam(params)] as const)
        : (["sequences", id, "lists"] as const),
    timeline: (id: string) => ["sequences", id, "timeline"] as const,
    analytics: (id: string) => ["sequences", id, "analytics"] as const,
    stats: (id: string) => ["sequences", id, "stats"] as const,
    activities: (id: string) => ["sequences", id, "activities"] as const,
  },
  templates: {
    all: ["templates"] as const,
    list: (params: ListParams) =>
      ["templates", "list", searchParam(params)] as const,
    detail: (id: string) => ["templates", "detail", id] as const,
    search: (q: string) => ["templates", "search", q] as const,
  },
  mailboxes: {
    all: ["mailboxes"] as const,
    detail: (id: string) => ["mailboxes", "detail", id] as const,
    count: ["mailboxes", "count"] as const,
    aliases: (id: string) => ["mailboxes", id, "aliases"] as const,
  },
  timeline: {
    all: ["timeline"] as const,
    list: (params: ListParams & { sequenceId?: string; userId?: string }) =>
      [
        "timeline",
        "list",
        params.sequenceId ?? "",
        params.userId ?? "",
        searchParam(params),
      ] as const,
    infinite: (
      params: Omit<ListParams, "page"> & { sequenceId?: string; userId?: string }
    ) =>
      [
        "timeline",
        "infinite",
        params.sequenceId ?? "",
        params.userId ?? "",
        `${params.limit}`,
      ] as const,
  },
  drafts: {
    all: ["drafts"] as const,
  },
  users: {
    all: ["users"] as const,
  },
} as const;
