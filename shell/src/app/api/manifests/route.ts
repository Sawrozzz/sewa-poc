import { NextResponse } from "next/server";
import {
  getSignedManifest,
  postTogetSignedManifest,
} from "@/lib/manifest-source";

export async function GET() {
  try {
    return NextResponse.json(await getSignedManifest(), {
      status: 200,
    });
  } catch (_error) {
    try {
      return NextResponse.json(await postTogetSignedManifest(), {
        status: 200,
      });
    } catch (_postError) {
      return NextResponse.json(
        {
          success: false,
          message: "Failed to fetch manifests.",
        },
        {
          status: 500,
        },
      );
    }
  }
}