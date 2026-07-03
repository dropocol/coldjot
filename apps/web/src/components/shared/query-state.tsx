"use client";

import { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";

/**
 * Standardizes loading / error / empty rendering for react-query powered views.
 *
 * Usage:
 *   <QueryState query={contactsQuery}>
 *     {(data) => data.contacts.map((c) => <ContactRow key={c.id} contact={c} />)}
 *   </QueryState>
 *
 * - `isLoading`  → centered spinner.
 * - `isError`    → muted "failed to load" message with an optional retry button.
 * - success      → renders `children(data)`.
 *
 * Pass `empty={<EmptyState/>}` and `isEmpty={(data) => data.total === 0}` to
 * get a tailored empty state; otherwise success with falsy data renders null.
 */
interface QueryStateProps<T> {
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
  empty?: ReactNode;
  isEmpty?: (data: T) => boolean;
  errorMessage?: string;
  /** When true (default), show a "Try again" button on error. */
  retryable?: boolean;
}

export function QueryState<T>({
  query,
  children,
  empty,
  isEmpty,
  errorMessage = "Failed to load",
  retryable = true,
}: QueryStateProps<T>) {
  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
        <p className="text-sm text-muted-foreground">{errorMessage}</p>
        {retryable && (
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Try again
          </button>
        )}
      </div>
    );
  }

  const data = query.data;
  if (data === undefined || data === null) {
    return <>{empty ?? null}</>;
  }
  if (isEmpty?.(data)) {
    return <>{empty ?? null}</>;
  }

  return <>{children(data)}</>;
}
