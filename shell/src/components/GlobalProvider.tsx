"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import PlatformShell from "./PlatformShell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function GlobalProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformShell>{children}</PlatformShell>
    </QueryClientProvider>
  );
}
