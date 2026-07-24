import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://sewa-poc-shell-roan.vercel.app/",
});

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  nationalId: string;
  permissions: string[];
};

const MOCK_PERMISSIONS = [
  "licenses:view",
  "licenses:pay",
  "chat:basic",
  "profile:view",
  "vehicles:view",
  "driving-license:view",
  "revenue-license:view",
];

export function mapSessionUser(
  user: { id: string; email: string; name: string } | undefined,
): SessionUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.name,
    nationalId: "123456789V",
    permissions: MOCK_PERMISSIONS,
  };
}
