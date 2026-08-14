import type { ModuleManifest } from "@sewa/host-platform";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getSignedManifest } from "@/lib/manifest-source";

/**
 * Bundle download proxy.
 *
 * Mini-app archives are served from object storage that sends no
 * `Access-Control-Allow-Origin`, so the browser cannot fetch them directly.
 * This route streams the archive through the shell's own origin instead.
 *
 * Only URLs the current signed manifest actually lists are fetched — the route
 * must never become an open proxy. Integrity is unaffected: the client hashes
 * the bytes it receives and compares them against the manifest's `bundleHash`,
 * so a tampered proxy response is rejected exactly like a tampered download.
 */
export async function GET(request: NextRequest) {
  const bundleUrl = request.nextUrl.searchParams.get("url");
  if (!bundleUrl) {
    return NextResponse.json(
      { success: false, message: "Missing url parameter." },
      { status: 400 },
    );
  }

  try {
    const manifest = await getSignedManifest();

    const isPublished = manifest.miniApps.some(
      (app: ModuleManifest) => app.bundleUrl === bundleUrl,
    );

    if (!isPublished) {
      return NextResponse.json(
        { success: false, message: "Bundle URL is not published in the manifest." },
        { status: 403 },
      );
    }

    const upstream = await fetch(bundleUrl, { cache: "no-store" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { success: false, message: `Bundle fetch failed with ${upstream.status}.` },
        { status: 502 },
      );
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        // The client caches the extracted files in IndexedDB; caching the
        // archive again here would only duplicate it.
        "Cache-Control": "no-store",
      },
    });
  } catch (_error) {
    return NextResponse.json(
      { success: false, message: "Server error while fetching the mini app bundle." },
      { status: 500 },
    );
  }
}
