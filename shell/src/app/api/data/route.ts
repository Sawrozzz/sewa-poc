import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "active";
  const limit = parseInt(searchParams.get("limit") ?? "10", 10);

  const items = Array.from({ length: Math.min(limit, 20) }, (_, i) => ({
    id: `item-${i + 1}`,
    name: `Sample Item ${i + 1}`,
    status,
    createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  }));

  return NextResponse.json({
    success: true,
    count: items.length,
    data: items,
    query: { status, limit },
  });
}
