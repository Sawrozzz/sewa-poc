import { NextResponse } from "next/server";
import { getManifestVersion } from "@/lib/manifest-source";

export async function GET() {
  try {
    return NextResponse.json(await getManifestVersion(), { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Server error while fetching manifest version.",
      },
      {
        status: 500,
      },
    );
  }
}
