import { MESSAGE_CHANNEL, PROTOCOL_VERSION } from "../constants";
import type { HostPlatformMessage, PlatformMessage } from "./message-types";

/** Lightweight structural check for inbound platform traffic. */
export function isPlatformMessage(data: unknown): data is PlatformMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as PlatformMessage;
  return (
    msg.channel === MESSAGE_CHANNEL &&
    typeof msg.namespace === "string" &&
    typeof msg.action === "string" &&
    typeof msg.source === "string" &&
    typeof msg.target === "string" &&
    (msg.type === "request" ||
      msg.type === "response" ||
      msg.type === "event" ||
      msg.type === "handshake")
  );
}

export function isStreamMessage(data: unknown): data is HostPlatformMessage & { type: "stream" } {
  if (!data || typeof data !== "object") return false;
  const msg = data as HostPlatformMessage;
  return (
    msg.channel === MESSAGE_CHANNEL &&
    msg.type === "stream" &&
    typeof msg.namespace === "string" &&
    typeof msg.action === "string"
  );
}

/**
 * Compares two protocol version strings by their major component only —
 * `"3.1.0"` and `"3.4.2"` are compatible, `"3.0.0"` and `"4.0.0"` are not.
 * Mirrors the SDK's `majorVersionsMatch`; only a major bump signals a
 * breaking wire-format change.
 */
export function majorVersionsMatch(a: string, b: string): boolean {
  return a.split(".")[0] === b.split(".")[0];
}

/**
 * Compares the protocol version stamped on an inbound message against this
 * host's `PROTOCOL_VERSION` (or an explicit `expected` value). Used to drop
 * traffic from a mini app shaped for a wire format this host doesn't speak.
 */
export function hasCompatibleMajorVersion(
  message: HostPlatformMessage,
  expected: string = PROTOCOL_VERSION,
): boolean {
  if (typeof message.gsaProtocolVersion !== "string") return false;
  return majorVersionsMatch(message.gsaProtocolVersion, expected);
}

/**
 * Splits a full event type (`navigation.route.changed`) into the
 * `namespace` / `action` pair the SDK re-assembles as `namespace.action`
 * when routing `event` messages to subscribers. Splits on the FIRST dot so
 * multi-part actions survive intact.
 */
export function splitEventType(type: string): {
  namespace: string;
  action: string;
} {
  const idx = type.indexOf(".");
  if (idx === -1) return { namespace: type, action: "" };
  return { namespace: type.slice(0, idx), action: type.slice(idx + 1) };
}
