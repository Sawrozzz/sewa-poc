import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "1.0.0",
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      uptime: process.uptime(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
