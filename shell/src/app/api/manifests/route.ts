import { NextResponse } from "next/server";
import { getSignedManifest, postTogetSignedManifest } from "@/core/manifest/manifest-source";

export async function GET() {
  try {
    return NextResponse.json(await getSignedManifest(), { status: 200 });
  } catch (error) {
    console.error("[manifests] GET failed:", error);
    try {
      return NextResponse.json(await postTogetSignedManifest(), { status: 200 });
    } catch (postError) {
      console.error("[manifests] POST fallback failed:", postError);
      return NextResponse.json(
        { success: false, message: "Failed to fetch manifests." },
        { status: 500 },
      );
    }
  }
}
