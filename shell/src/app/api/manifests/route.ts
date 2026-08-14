import { NextResponse } from "next/server";
import { getSignedManifest } from "@/lib/manifest-source";

export async function GET() {
  try {
    return NextResponse.json(await getSignedManifest(), { status: 200 });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        message: "Server error while fetching mmanifests.",
      },
      {
        status: 500,
      },
    );
  }
}
