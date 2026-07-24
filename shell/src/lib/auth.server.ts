import { betterAuth, APIError } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { nextCookies } from "better-auth/next-js";
import { createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { z } from "zod";

const db: Record<string, any[]> = {
  user: [],
  session: [],
  account: [],
  verification: [],
};

const MOCK_USER = {
  email: "citizen@gov.np",
  password: "password",
  name: "Demo Citizen",
};

const ropcLoginPlugin = {
  id: "ropc-login",
  endpoints: {
    ropcLogin: createAuthEndpoint(
      "/ropc-login",
      {
        method: "POST",
        body: z.object({
          username: z.string(),
          password: z.string(),
          clientId: z.string(),
          providerId: z.string(),
        }),
      },
      async (ctx) => {
        const { username, password } = ctx.body;

        if (
          username !== MOCK_USER.email ||
          password !== MOCK_USER.password
        ) {
          throw new APIError("UNAUTHORIZED", {
            message: "Invalid credentials",
          });
        }

        const email = username;

        const existing = await ctx.context.internalAdapter.findUserByEmail(
          email,
        );

        let userId: string;
        if (existing) {
          userId = existing.user.id;
        } else {
          const newUser = await ctx.context.internalAdapter.createUser({
            email,
            name: MOCK_USER.name,
            emailVerified: true,
          });
          userId = newUser.id;
        }

        const session = await ctx.context.internalAdapter.createSession(userId);

        const user = await ctx.context.internalAdapter.findUserById(userId);

        await setSessionCookie(ctx, { session, user: user! });

        return ctx.json({ session, user });
      },
    ),
  },
};

export const auth = betterAuth({
  database: memoryAdapter(db),
  plugins: [
    nextCookies(),
    ropcLoginPlugin,
  ],
});
