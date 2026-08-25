"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type React from "react";
import { useFcmToken } from "@/hooks/use-fcm-token";
import NotificationListener from "./NotificationListener";
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
  useFcmToken();

  return (
    <QueryClientProvider client={queryClient}>
      <NotificationListener />
      <PlatformShell>{children}</PlatformShell>
    </QueryClientProvider>
  );
}
