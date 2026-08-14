/**
 * Minimal ZIP reader for mini-app bundles.
 *
 * Mini-apps published through the signed manifest registry ship as a single
 * `.zip` of their `dist/` output. This module unpacks that archive entirely in
 * the browser using `DecompressionStream("deflate-raw")`, so no third-party
 * inflate dependency is pulled into the shell.
 *
 * Only the two compression methods Vite/Rollup produce for a `dist` archive are
 * supported: STORED (0) and DEFLATE (8).
 */

/** End of central directory record signature ("PK\x05\x06") */
const EOCD_SIGNATURE = 0x06054b50;

/** Central directory file header signature ("PK\x01\x02") */
const CENTRAL_FILE_SIGNATURE = 0x02014b50;

/** Local file header signature ("PK\x03\x04") */
const LOCAL_FILE_SIGNATURE = 0x04034b50;

/** Fixed size of the end of central directory record (without comment) */
const EOCD_SIZE = 22;

/** Compression methods this reader understands */
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

/** Marker written into 32-bit size/offset fields when zip64 extensions apply */
const ZIP64_MARKER = 0xffffffff;

/**
 * A single extracted archive entry.
 */
export interface ZipEntry {
  /** Entry path relative to the archive root (e.g. "assets/main-abc.css") */
  path: string;
  /** Raw uncompressed bytes */
  bytes: Uint8Array;
}

/**
 * Locate the end of central directory record.
 *
 * The record sits at the tail of the archive but may be followed by a comment
 * of up to 64KB, so the tail is scanned backwards for the signature.
 *
 * @param view - View over the whole archive
 * @returns Byte offset of the record, or -1 when not found
 */
function findEndOfCentralDirectory(view: DataView): number {
  const maxCommentLength = 0xffff;
  const lowerBound = Math.max(0, view.byteLength - EOCD_SIZE - maxCommentLength);
  for (let offset = view.byteLength - EOCD_SIZE; offset >= lowerBound; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

/**
 * Inflate a raw DEFLATE stream using the platform's DecompressionStream.
 *
 * @param bytes - Compressed bytes (no zlib/gzip header)
 * @returns Uncompressed bytes
 */
async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is unavailable — cannot unzip mini-app bundle");
  }
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  const inflated = await new Response(stream).arrayBuffer();
  return new Uint8Array(inflated);
}

/**
 * Unpack a ZIP archive into its entries.
 *
 * Directory entries and macOS resource-fork noise (`__MACOSX/`, `.DS_Store`)
 * are skipped — an archive zipped on a Mac carries both and neither belongs in
 * the cache.
 *
 * @param archive - Complete archive bytes
 * @returns Map of entry path to uncompressed bytes
 * @throws When the archive is malformed, zip64, or uses an unsupported method
 *
 * @example
 * ```typescript
 * const entries = await unzip(new Uint8Array(await res.arrayBuffer()));
 * const manifest = new TextDecoder().decode(entries.get("manifest.json"));
 * ```
 */
export async function unzip(archive: Uint8Array): Promise<Map<string, Uint8Array>> {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) {
    throw new Error("Not a ZIP archive — end of central directory record not found");
  }

  const entryCount = view.getUint16(eocd + 10, true);
  const centralDirOffset = view.getUint32(eocd + 16, true);
  if (centralDirOffset === ZIP64_MARKER || entryCount === 0xffff) {
    throw new Error("ZIP64 archives are not supported");
  }

  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let cursor = centralDirOffset;

  for (let i = 0; i < entryCount; i++) {
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error(`Corrupt ZIP central directory at entry ${i}`);
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const path = decoder.decode(archive.subarray(cursor + 46, cursor + 46 + nameLength));

    cursor += 46 + nameLength + extraLength + commentLength;

    // Directory markers and archiver metadata carry no bundle content
    if (path.endsWith("/") || path.startsWith("__MACOSX/") || path.endsWith(".DS_Store")) {
      continue;
    }
    if (compressedSize === ZIP64_MARKER || localHeaderOffset === ZIP64_MARKER) {
      throw new Error(`ZIP64 entry "${path}" is not supported`);
    }

    if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`Corrupt ZIP local header for "${path}"`);
    }
    // The local header's own name/extra lengths are authoritative for locating
    // the payload — the extra field frequently differs from the central copy.
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const raw = archive.subarray(dataStart, dataStart + compressedSize);

    let bytes: Uint8Array;
    if (method === METHOD_STORED) {
      bytes = raw.slice();
    } else if (method === METHOD_DEFLATE) {
      bytes = await inflateRaw(raw);
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for "${path}"`);
    }

    if (bytes.byteLength !== uncompressedSize) {
      throw new Error(
        `ZIP entry "${path}" size mismatch — expected ${uncompressedSize}, got ${bytes.byteLength}`,
      );
    }

    entries.set(path, bytes);
  }

  return entries;
}
