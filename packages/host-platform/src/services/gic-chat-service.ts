import type { GicChatEvent, GicChatSession, GicChatStreamRequest } from "@lizuz/mini-app-types";

/**
 * GIC service — spec endpoints:
 *  - POST /start-session → GicChatSession {status, user_id, session_id}
 *  - POST /stream GicChatStreamRequest {user_id, session_id, message} → text/event-stream GicChatEvent
 *    tool_call, tool_result, keep_alive, token{ text }, meta{ invocation_id }, done, error{ detail }
 *
 * Host reads GIC base URL from env `GIC_CHAT_BASE_URL` or defaults to `http://localhost:8000`.
 * Generic chat ChatMessage/ChatSdkModule stays in ChatSdkModule (HTTP.CHAT_STREAM generic), file streaming stays HTTP.GET_STREAM.
 */

export interface GicChatServiceConfig {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class GicChatService {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: GicChatServiceConfig = {}) {
    this.baseUrl = (
      config.baseUrl ??
      process.env.GIC_CHAT_BASE_URL ??
      "http://localhost:8000"
    ).replace(/\/$/, "");
    this.fetchImpl = config.fetchImpl ?? (globalThis.fetch as typeof fetch);
  }

  async startSession(): Promise<GicChatSession> {
    const res = await this.fetchImpl(`${this.baseUrl}/start-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      let detail = `Failed to start session: ${res.status}`;
      try {
        const j = JSON.parse(text);
        detail = j.detail ?? detail;
      } catch {
        if (text) detail = text;
      }
      throw new Error(detail);
    }
    const data = (await res.json()) as { status: string; user_id: string; session_id: string };
    if (!data.user_id || !data.session_id) {
      throw new Error("Invalid session response from GIC");
    }
    return data;
  }

  /**
   * Streams GIC response. Calls `onEvent` for each GicChatEvent SSE.
   * Throws on 404 session not found, or on `error` event (detail).
   */
  async stream(
    request: GicChatStreamRequest,
    onEvent: (event: GicChatEvent) => void | Promise<void>,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!request.user_id || !request.session_id) {
      throw new Error("user_id and session_id required");
    }
    if (!request.message || request.message.trim().length === 0) {
      throw new Error("message must be non-blank");
    }
    if (request.message.length > 200) {
      throw new Error("message must be ≤200 characters");
    }

    const res = await this.fetchImpl(`${this.baseUrl}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(request),
      signal,
    });

    if (!res.ok) {
      // 404 session not found per spec
      const text = await res.text().catch(() => "");
      let detail = `GIC stream failed: ${res.status}`;
      try {
        const j = JSON.parse(text);
        detail = j.detail ?? detail;
      } catch {
        if (text) detail = text;
      }
      // Spec: 404 detail "Session '...' not found"
      throw new Error(detail);
    }

    if (!res.body) {
      throw new Error("No response body for GIC stream");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const pushEvent = async (rawEvent: string): Promise<void> => {
      // rawEvent is like "event: token\ndata: {\"text\":\"...\"}"
      const lines = rawEvent.split("\n");
      let eventType: string | undefined;
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!eventType) return;
      const dataRaw = dataLines.join("\n");
      let data: unknown = {};
      if (dataRaw) {
        try {
          data = JSON.parse(dataRaw);
        } catch {
          data = { text: dataRaw };
        }
      }
      // Normalize to GicChatEvent shape for SDK (flat: {type, ...data} e.g. {type:"token", text:"..."})
      const event = {
        type: eventType,
        ...(data && typeof data === "object" ? (data as Record<string, unknown>) : { text: data }),
      } as GicChatEvent;
      await onEvent(event);
      if (eventType === "error") {
        const detail = (data as { detail?: string })?.detail ?? "GIC stream error";
        throw new Error(detail);
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE events delimited by \n\n
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (chunk.trim()) await pushEvent(chunk);
        }
      }
      // Flush remaining
      if (buffer.trim()) await pushEvent(buffer);
    } finally {
      try {
        reader.releaseLock();
      } catch {}
    }
  }
}
