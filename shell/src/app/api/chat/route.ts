import { NextResponse } from "next/server";

const ALLOWED_MODELS = new Set(["qwen", "qwen3.6"]);
const MAX_BODY_BYTES = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 30_000;

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    if (rawBody.length > MAX_BODY_BYTES) {
      return NextResponse.json({ error: "Request body too large" }, { status: 413 });
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const { messages, options } = parsed as {
      messages?: unknown;
      options?: { model?: string; temperature?: number; maxTokens?: number };
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }
    for (const m of messages) {
      if (
        !m ||
        typeof (m as { role?: unknown }).role !== "string" ||
        typeof (m as { content?: unknown }).content !== "string"
      ) {
        return NextResponse.json(
          { error: "Each message must have string role and content" },
          { status: 400 },
        );
      }
      if ((m as { content: string }).content.length > 20_000) {
        return NextResponse.json({ error: "Message content too large" }, { status: 400 });
      }
    }

    const apiKey = process.env.QWEN_API_KEY;
    const baseUrl = process.env.QWEN_BASE_URL || "https://qwen.allxtract.com/v1";
    const cfAccessClientId = process.env.CF_ACCESS_CLIENT_ID;
    const cfAccessClientSecret = process.env.CF_ACCESS_CLIENT_SECRET;

    if (!apiKey || !cfAccessClientId || !cfAccessClientSecret) {
      console.error("[chat proxy] missing required env: QWEN_API_KEY/CF_ACCESS_*");
      return NextResponse.json({ error: "Service not configured" }, { status: 503 });
    }

    const ALLOWED_TEMPERATURE_RANGE: [number, number] = [0, 2];
    if (
      options?.temperature !== undefined &&
      (typeof options.temperature !== "number" ||
        options.temperature < ALLOWED_TEMPERATURE_RANGE[0] ||
        options.temperature > ALLOWED_TEMPERATURE_RANGE[1])
    ) {
      return NextResponse.json({ error: "Invalid temperature" }, { status: 400 });
    }

    const modelMap: Record<string, string> = { qwen: "qwen3.6" };
    const requestedModel = typeof options?.model === "string" ? options.model : undefined;
    const model = requestedModel ? (modelMap[requestedModel] ?? requestedModel) : "qwen3.6";
    if (!ALLOWED_MODELS.has(model) && !model.startsWith("qwen")) {
      return NextResponse.json({ error: "Unsupported model" }, { status: 400 });
    }

    const bodyMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    let resp: Response;
    try {
      resp = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "CF-Access-Client-Id": cfAccessClientId,
          "CF-Access-Client-Secret": cfAccessClientSecret,
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: bodyMessages,
          stream: true,
          temperature: options?.temperature,
          max_tokens: options?.maxTokens,
        }),
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      console.error("[chat proxy] upstream error", resp.status, errText.slice(0, 500));
      return NextResponse.json({ error: "Upstream service error" }, { status: 502 });
    }

    return new Response(resp.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Qwen Api Error", error);

    return NextResponse.json(
      {
        error: "Internal server error",
      },
      { status: 500 },
    );
  }
}
