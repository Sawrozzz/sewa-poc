"use client"
import { useMemo, useRef, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authClient, mapSessionUser } from "@/lib/auth-client";
import { PlatformProvider } from "@/platform";
import { CommunicationDebugger } from "@/components/CommunicationDebugger";
import type { PlatformServicesConfig } from "@/platform/services";

export default function  PlatformShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const user = mapSessionUser(session?.user);

  const userRef = useRef(user);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const authConfig = useMemo<PlatformServicesConfig>(
    () => ({
      getUser: () => userRef.current,
      getAccessToken: () => null,
      logout: async () => {
        await authClient.signOut();
      },
      navigate: (path: string) => router.push(path),
    }),
    [router],
  );

  return (
    <PlatformProvider authConfig={authConfig}>
      {children}
      <CommunicationDebugger />
    </PlatformProvider>
  );
}
