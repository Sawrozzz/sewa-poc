/**
 * Single source of truth for the mocked citizen account.
 *
 * Everything the login / OTP flow and the session mapper need lives here so a
 * real identity provider can later replace it without touching the UI.
 */

export const SRI_LANKA_DIAL_CODE = "+94";

/** OTP the mock backend always issues — prefilled in the verify screen. */
export const MOCK_OTP = "123456";

export const MOCK_CITIZEN = {
  /** National significant number, i.e. without the +94 dial code. */
  phoneNumber: "984049910",
  /** Full E.164 number used as the login identifier. */
  phoneE164: `${SRI_LANKA_DIAL_CODE}984049910
  `,

  email: "nimal.perera@citizen.gov.lk",
  fullName: "Nimal Perera",

  nationalId: "199012345678",
  nic: "901234567V",
  dateOfBirth: "1990-05-12",
  gender: "male",

  address: {
    line1: "42/3 Galle Road",
    city: "Colombo",
    district: "Colombo",
    province: "Western",
    postalCode: "00300",
  },

  preferredLanguage: "en",
  emailVerified: true,
  phoneVerified: true,

  roles: ["citizen"],
  permissions: [
    "licenses:view",
    "licenses:pay",
    "chat:basic",
    "profile:view",
    "vehicles:view",
    "driving-license:view",
    "revenue-license:view",
  ],
} as const;

/** Normalises whatever the user typed into a bare national number. */
export function normalisePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^94/, "").replace(/^0/, "");
}

export function toE164(raw: string): string {
  return `${SRI_LANKA_DIAL_CODE}${normalisePhoneNumber(raw)}`;
}
