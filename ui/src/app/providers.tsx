"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/wagmi";

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Don't refetch on every focus/mount — kills the public-RPC budget
            // and makes the page feel sluggish when reads are slow.
            staleTime: 10_000,
            refetchOnWindowFocus: false,
            refetchOnMount: false,
            // Don't infinitely retry — failed reads (e.g. zero-address contracts on
            // the wrong chain) should fail fast so the user sees something usable.
            retry: 1,
            retryDelay: 1000,
          },
        },
      }),
  );
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
