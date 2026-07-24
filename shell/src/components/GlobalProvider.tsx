"use client";
import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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

if (typeof window !== "undefined") {
  (window as any).React = React;
  (window as any).ReactDOM = ReactDOM;
}

export default function GloabalProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <PlatformShell>{children}</PlatformShell>
    </QueryClientProvider>
  );
}
