import {  NextResponse } from "next/server";

import { getManifestMiniApps } from "@/lib/manifest-source";

export async function GET() {
  try {
    return NextResponse.json(await getManifestMiniApps(), { status: 200 });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        message: "Server error while fetching mini apps.",
      },
      {
        status: 500,
      },
    );
  }
}
