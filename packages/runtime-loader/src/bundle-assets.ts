/**
 * Helpers for turning unpacked `.zip` entries into something the shell can
 * evaluate.
 *
 * A bundle downloaded as an archive has no origin to serve its assets from, so
 * every non-code file is republished as a blob URL and the references to it
 * inside the entry JS and CSS are rewritten to point at that URL.
 */

import type { BundleContents } from "./types";

/** File extensions stored as text (and therefore safe to round-trip as a string) */
const TEXT_EXTENSIONS = new Set([
  "js",
  "mjs",
  "cjs",
  "css",
  "json",
  "svg",
  "html",
  "txt",
  "map",
  "webmanifest",
]);

/** MIME types by extension — enough to cover a Vite `dist` output */
const MIME_TYPES: Record<string, string> = {
  js: "application/javascript",
  mjs: "application/javascript",
  cjs: "application/javascript",
  css: "text/css",
  json: "application/json",
  svg: "image/svg+xml",
  html: "text/html",
  txt: "text/plain",
  map: "application/json",
  webmanifest: "application/manifest+json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/**
 * Extract the lowercase extension from an archive path.
 *
 * @param path - Entry path, e.g. "assets/main-abc.css"
 * @returns Extension without the dot, or "" when there is none
 */
function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot < 0 ? "" : path.slice(dot + 1).toLowerCase();
}

/**
 * Whether an entry should be cached as text rather than raw bytes.
 *
 * @param path - Entry path
 * @returns True for code and text assets
 */
export function isTextAsset(path: string): boolean {
  return TEXT_EXTENSIONS.has(extensionOf(path));
}

/**
 * Resolve the MIME type to serve an entry with.
 *
 * @param path - Entry path
 * @returns MIME type, falling back to a generic binary type
 */
export function mimeTypeFor(path: string): string {
  return MIME_TYPES[extensionOf(path)] ?? "application/octet-stream";
}

/**
 * Split unpacked archive entries into text and binary buckets.
 *
 * @param entries - Entries produced by {@link unzip}
 * @returns Bundle contents ready to be handed to the cache
 */
export function splitBundleEntries(entries: Map<string, Uint8Array>): BundleContents {
  const decoder = new TextDecoder();
  const contents: BundleContents = { text: {}, binary: {} };

  for (const [path, bytes] of entries) {
    if (isTextAsset(path)) {
      contents.text[path] = decoder.decode(bytes);
    } else {
      // slice() so the stored buffer does not retain the whole archive
      contents.binary[path] = {
        bytes: bytes.slice().buffer as ArrayBuffer,
        mimeType: mimeTypeFor(path),
      };
    }
  }

  return contents;
}

/**
 * Escape a string for literal use inside a regular expression.
 *
 * @param value - Raw string
 * @returns Escaped string
 */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Point asset references inside code at their blob URLs.
 *
 * Only occurrences that immediately follow a quote or `(` are rewritten — that
 * covers `import "./icons.svg"`, `url(/assets/logo.png)` and the string
 * literals Vite emits, without touching unrelated text that happens to contain
 * the same characters.
 *
 * Longer paths are substituted first so `assets/a.png` is never partially
 * matched by a shorter sibling.
 *
 * @param code - Entry JS or CSS source
 * @param assetUrls - Archive path to blob URL
 * @returns Source with references rewritten
 */
export function rewriteAssetReferences(code: string, assetUrls: Record<string, string>): string {
  const paths = Object.keys(assetUrls).sort((a, b) => b.length - a.length);
  let output = code;

  for (const path of paths) {
    const pattern = new RegExp(`(["'\`(])(?:\\.{0,2}/)?${escapeForRegExp(path)}(?=["'\`)])`, "g");
    output = output.replace(pattern, (_match, opener: string) => `${opener}${assetUrls[path]}`);
  }

  return output;
}
