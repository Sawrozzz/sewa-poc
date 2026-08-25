import { APIError, betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { nextCookies } from "better-auth/next-js";
import { z } from "zod";
import { MOCK_CITIZEN, MOCK_OTP, normalisePhoneNumber, toE164 } from "@/core/mocks/mock-user";

const db: Record<string, []> = {
  user: [],
  session: [],
  account: [],
  verification: [],
};

/**
 * Mock phone + OTP login.
 *
 * `send` pretends to dispatch an SMS and echoes the OTP back so the verify
 * screen can prefill it. `verify` performs no OTP validation (POC) — it only
 * checks that the phone number is the mocked citizen's.
 */
const phoneOtpPlugin = {
  id: "phone-otp",
  endpoints: {
    sendPhoneOtp: createAuthEndpoint(
      "/phone-otp/send",
      {
        method: "POST",
        body: z.object({
          phoneNumber: z.string().min(1),
        }),
      },
      async (ctx) => {
        const phoneNumber = normalisePhoneNumber(ctx.body.phoneNumber);

        if (phoneNumber.length < 9) {
          throw new APIError("BAD_REQUEST", {
            message: "Enter a valid Sri Lankan mobile number",
          });
        }

        return ctx.json({
          success: true,
          phoneNumber: toE164(phoneNumber),
          // Mock delivery: returned so the UI can prefill the OTP boxes.
          otp: MOCK_OTP,
          expiresIn: 300,
        });
      },
    ),

    verifyPhoneOtp: createAuthEndpoint(
      "/phone-otp/verify",
      {
        method: "POST",
        body: z.object({
          phoneNumber: z.string().min(1),
          // Accepted as-is — no verification in the POC.
          code: z.string().optional(),
        }),
      },
      async (ctx) => {
        // No OTP check and no number check — any input signs in as the mock
        // citizen. The number the user typed is kept on the session so the UI
        // shows it back.
        const phoneNumber = normalisePhoneNumber(ctx.body.phoneNumber);
        const phoneE164 = phoneNumber ? toE164(phoneNumber) : MOCK_CITIZEN.phoneE164;

        const existing = await ctx.context.internalAdapter.findUserByEmail(MOCK_CITIZEN.email);

        let userId: string;
        if (existing) {
          userId = existing.user.id;
          await ctx.context.internalAdapter.updateUser(userId, {
            phoneNumber: phoneE164,
          } as never);
        } else {
          const newUser = await ctx.context.internalAdapter.createUser(
            {
              email: MOCK_CITIZEN.email,
              name: MOCK_CITIZEN.fullName,
              emailVerified: MOCK_CITIZEN.emailVerified,
              phoneNumber: phoneE164,
              phoneVerified: MOCK_CITIZEN.phoneVerified,
              nationalId: MOCK_CITIZEN.nationalId,
            } as never,
            {
              method: "oauth",
            },
          );
          userId = newUser.id;
        }

        const session = await ctx.context.internalAdapter.createSession(userId);
        const user = await ctx.context.internalAdapter.findUserById(userId);

        // biome-ignore lint/style/noNonNullAssertion: <Fix this later>
        await setSessionCookie(ctx, { session, user: user! });

        return ctx.json({ session, user });
      },
    ),
  },
};

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: memoryAdapter(db),
  // On-device testing opens the shell from the dev machine's LAN IP, so in
  // development trust loopback plus the RFC-1918 private ranges. Production
  // must set BETTER_AUTH_URL to the deployed origin instead.
  trustedOrigins: [
    ...(process.env.NODE_ENV === "development"
      ? [
          "http://localhost:*",
          "http://127.0.0.1:*",
          "http://10.*",
          "http://172.*",
          "http://192.168.*",
        ]
      : []),
    ...(process.env.BETTER_AUTH_URL ? [new URL(process.env.BETTER_AUTH_URL).origin] : []),
  ],
  user: {
    additionalFields: {
      phoneNumber: { type: "string", required: false, input: false },
      phoneVerified: { type: "boolean", required: false, input: false },
      nationalId: { type: "string", required: false, input: false },
    },
  },
  plugins: [nextCookies(), phoneOtpPlugin],
});
