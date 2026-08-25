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
const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
const BUNDLE_FETCH_TIMEOUT_MS = 30000;

function normalizeBundleUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

export async function GET(request: NextRequest) {
  const bundleUrl = request.nextUrl.searchParams.get("url");
  if (!bundleUrl) {
    return NextResponse.json(
      { success: false, message: "Missing url parameter." },
      { status: 400 },
    );
  }
  let parsed: URL;
  try {
    parsed = new URL(bundleUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("unsupported protocol");
  } catch {
    return NextResponse.json({ success: false, message: "Invalid bundle URL." }, { status: 400 });
  }

  try {
    const manifest = await getSignedManifest();
    const normalized = normalizeBundleUrl(bundleUrl);
    const isPublished = manifest.miniApps.some(
      (app: ModuleManifest) => app.bundleUrl && normalizeBundleUrl(app.bundleUrl) === normalized,
    );
    if (!isPublished) {
      return NextResponse.json(
        { success: false, message: "Bundle URL is not published in the manifest." },
        { status: 403 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BUNDLE_FETCH_TIMEOUT_MS);
    let upstream: Response;
    try {
      upstream = await fetch(bundleUrl, { cache: "no-store", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { success: false, message: `Bundle fetch failed with ${upstream.status}.` },
        { status: 502 },
      );
    }
    const len = upstream.headers.get("content-length");
    if (len && Number(len) > MAX_BUNDLE_BYTES) {
      return NextResponse.json({ success: false, message: "Bundle too large." }, { status: 413 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[bundle proxy] error:", error);
    if ((error as Error)?.name === "AbortError") {
      return NextResponse.json(
        { success: false, message: "Bundle fetch timed out." },
        { status: 504 },
      );
    }
    return NextResponse.json(
      { success: false, message: "Server error while fetching the mini app bundle." },
      { status: 500 },
    );
  }
}
