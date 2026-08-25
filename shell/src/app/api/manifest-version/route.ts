import { NextResponse } from "next/server";
import { getManifestVersion } from "@/core/manifest/manifest-source";

export async function GET() {
  try {
    return NextResponse.json(await getManifestVersion(), { status: 200 });
  } catch (error) {
    console.error("[manifest-version] error:", error);
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Server error while fetching manifest version.",
      },
      { status: 500 },
    );
  }
}
