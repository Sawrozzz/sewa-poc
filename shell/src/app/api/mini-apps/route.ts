import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getManifestMiniApps } from "@/lib/manifest-source";
import type { OrderByProps } from "@/types/manifest";

/**
 * Paginated mini-app catalog.
 *
 * Pagination and search parameters are passed straight through to the registry.
 * Only the known ones are forwarded, so the client cannot smuggle arbitrary
 * query parameters into the upstream call.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const size = Number(params.get("size"));
  const orderBy = params.get("orderBy");

  try {
    const rawSearch = params.get("search");
    const rawSearchBy = params.get("searchBy");
    const cleanSearch = rawSearch?.slice(0, 200);
    const cleanSearchBy = rawSearchBy?.slice(0, 50);
    const page = await getManifestMiniApps({
      size: Number.isFinite(size) && size > 0 ? Math.min(size, 100) : undefined,
      orderBy: orderBy === "ASC" || orderBy === "DESC" ? (orderBy as OrderByProps) : undefined,
      sortBy: params.get("sortBy")?.slice(0, 50) ?? undefined,
      cursor: params.get("cursor")?.slice(0, 500) ?? undefined,
      searchBy: cleanSearchBy,
      search: cleanSearch,
    });
    return NextResponse.json(page, { status: 200 });
  } catch (error) {
    console.error("[mini-apps] error:", error);
    return NextResponse.json(
      { success: false, message: "Server error while fetching mini apps." },
      { status: 500 },
    );
  }
}
