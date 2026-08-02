import { createAuthClient } from "better-auth/react";
import { MOCK_CITIZEN } from "./mock-user";

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_AUTH_API_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://sewa-poc-shell-roan.vercel.app/",
});

/**
 * Shape handed to mini apps through the SDK (`sdk.auth.getUser()`).
 * The first five fields are the `PlatformUser` contract — do not remove them.
 */
export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  nationalId: string;
  permissions: string[];
  roles: string[];
  phoneNumber: string;
  metadata: Record<string, unknown>;
};

type RawSessionUser = {
  id: string;
  email: string;
  name: string;
  phoneNumber?: string | null;
  nationalId?: string | null;
};

export function mapSessionUser(
  user: RawSessionUser | undefined,
): SessionUser | null {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.name,
    nationalId: user.nationalId ?? MOCK_CITIZEN.nationalId,
    permissions: [...MOCK_CITIZEN.permissions],
    roles: [...MOCK_CITIZEN.roles],
    phoneNumber: user.phoneNumber ?? MOCK_CITIZEN.phoneE164,
    metadata: {
      phoneNumber: user.phoneNumber ?? MOCK_CITIZEN.phoneE164,
      phoneVerified: MOCK_CITIZEN.phoneVerified,
      nic: MOCK_CITIZEN.nic,
      dateOfBirth: MOCK_CITIZEN.dateOfBirth,
      gender: MOCK_CITIZEN.gender,
      address: MOCK_CITIZEN.address,
      district: MOCK_CITIZEN.address.district,
      preferredLanguage: MOCK_CITIZEN.preferredLanguage,
    },
  };
}
