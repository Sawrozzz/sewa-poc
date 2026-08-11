import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    sdkCdnUrl: process.env.SDK_CDN_URL ?? "",
  });
}
