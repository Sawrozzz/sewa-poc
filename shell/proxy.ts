import { headers } from "next/headers";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/features/auth/auth-server";

const publicPaths = [
  "/",
  "/api/auth",
  "/_next",
  "/serwist",
  "/manifest.webmanifest",
  "/~offline",
  "/favicon.ico",
];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const applySecurity = (res: NextResponse) => {
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-ancestors 'none'",
    );
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    if (pathname.startsWith("/api/")) res.headers.set("Cache-Control", "no-store");
    return res;
  };

  const isPublic = publicPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (isPublic) {
    return applySecurity(NextResponse.next());
  }

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    const loginUrl = new URL("/", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return applySecurity(NextResponse.redirect(loginUrl));
  }

  return applySecurity(NextResponse.next());
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
