import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { ...body } = await request.json();

    const response = await fetch("http://10.10.30.122:3001/v1/service-requests", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-app-id": "mini-revenue-license",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (_error) {
    return NextResponse.json(
      {
        success: false,
        message: "Server error while creating service request.",
      },
      {
        status: 500,
      },
    );
  }
}
