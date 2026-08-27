import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { messages, options } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "Messages array is required" }, { status: 400 });
    }

    const apiKey =
      process.env.QWEN_API_KEY ||
      "570a0a6de044f2c864259b6f744b54ec30e7315e22e24092c06f6e011e1d2114";
    const baseUrl = process.env.QWEN_BASE_URL || "https://qwen.allxtract.com/v1";
    const cfAccessClientId =
      process.env.CF_ACCESS_CLIENT_ID || "ae031ce6b6b9d8647f8c3f086372a62c.access";
    const cfAccessClientSecret =
      process.env.CF_ACCESS_CLIENT_SECRET ||
      "e05834d2c057d48cc226468059addb9f4f93908de33e4369e7e4245625a4f403";
    const modelMap: Record<string, string> = { qwen: "qwen3.8" };
    const model = modelMap[options?.model as string] || options?.model;

    const bodyMessages = messages.map((msg: { role: string; content: string }) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    const resp = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
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

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[chat proxy] upstream error", resp.status, errText);
      return NextResponse.json({ error: errText }, { status: 500 });
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
