"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactNode, useState } from "react";

/**
 * App-wide react-query provider.
 *
 * The `QueryClient` is created inside a `useState` initializer so there is
 * exactly one instance per browser session (never re-created on re-render),
 * and so SSR doesn't share a cache between requests.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30s before a window-focus / re-mount triggers a background refetch.
            staleTime: 30_000,
            // One retry — enough to ride over a transient blip, not enough to
            // mask a real outage with a long hang.
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
