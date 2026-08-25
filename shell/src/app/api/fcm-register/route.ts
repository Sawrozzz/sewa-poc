import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { ...reqBody } = await request.json();
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/citizen/v1/devices/tokens`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-citizen-id": crypto.randomUUID(),
        "x-session-id": crypto.randomUUID(),
        "x-correlation-id": crypto.randomUUID(),
      },
      body: JSON.stringify(reqBody),
    });

    const data = await response.json();

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (_) {
    return NextResponse.json(
      {
        success: false,
        message: "Server error while posting fcm token",
      },
      {
        status: 500,
      },
    );
  }
}
