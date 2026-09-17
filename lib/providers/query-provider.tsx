'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

// Opt-in: set NEXT_PUBLIC_QUERY_DEVTOOLS=true in .env.local to show the
// TanStack Query devtools button. Off by default so it isn't in everyone's way.
// The NODE_ENV guard keeps the devtools out of production bundles regardless.
const SHOW_QUERY_DEVTOOLS =
  process.env.NODE_ENV === 'development' &&
  process.env.NEXT_PUBLIC_QUERY_DEVTOOLS === 'true';

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {SHOW_QUERY_DEVTOOLS && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
