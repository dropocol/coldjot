import { z } from "zod";

// ─── Pagination & list envelopes ────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().optional(),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

/** Shared pagination block returned by every list endpoint. */
export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
  nextPage?: number;
}

/**
 * Generic paginated list envelope. `itemsKey` is the domain key
 * (e.g. "contacts", "sequences") holding the rows.
 */
export type PaginatedResponse<K extends string, T> = {
  [P in K]: T[];
} & PaginationMeta;

/** Convenience alias for the common `{ data: T[] } & PaginationMeta` shape. */
export type ListResponse<T> = PaginatedResponse<"data", T>;

// ─── Common params ───────────────────────────────────────────────────────────

export const idParamsSchema = z.object({
  id: z.string().min(1),
});
export type IdParams = z.infer<typeof idParamsSchema>;

/**
 * Pagination params for client-side list queries (react-query keys, query
 * string builders). The server-side counterpart is `paginationSchema`.
 */
export interface ListParams {
  page: number;
  limit: number;
  search?: string;
}
