import { NextResponse } from "next/server";
import { getSignedManifest } from "@/lib/manifest-source";

/**
 * Hand the registry's signed manifest to the browser untouched.
 *
 * The signature is verified client-side, so this route must not reshape the
 * document — any re-serialization here would change the bytes the signature
 * was produced over.
 */
export async function GET() {
  try {
    return NextResponse.json(await getSignedManifest(), { status: 200 });
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
