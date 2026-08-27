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

    // An upstream error page (HTML, empty body, gateway text) must not be
    // turned into a generic 500 — the client needs the real status/message.
    const raw = await response.text();
    let data: unknown;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = {
        success: response.ok,
        message: raw.slice(0, 200) || `Upstream returned HTTP ${response.status}.`,
      };
    }

    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error("fcm-register: upstream request failed", error);
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
