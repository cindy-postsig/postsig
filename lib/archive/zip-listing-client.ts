// Browser-side ZIP central-directory parser. Reads a user's selected file via
// `Blob.slice()` — no network, no full read of the parent. Also recurses into
// any `.zip` entry it finds, reading its local header + bytes (via slice for
// stored entries, DecompressionStream for deflated) so the persisted listing
// captures nested-zip contents inline.

import {
  MAX_PERSISTED_ENTRIES,
  type PersistedZipEntry,
} from '@/lib/v2/archives/zip-listing-schema';

const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const SIG_ZIP64_EOCD = 0x06064b50;
const SIG_CD_HEADER = 0x02014b50;
const LOCAL_HEADER_SIG = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const LOCAL_HEADER_FIXED_SIZE = 30;
const EOCD_SEARCH_WINDOW = 0xffff + EOCD_MIN_SIZE;

// Cap on how far down we recurse into nested zips. Pathological inputs
// (zip bombs, accidental cycles) can't run away.
const MAX_NESTING_DEPTH = 5;
// Above this compressed size we skip inflating a DEFLATED inner zip — it
// stays in the listing as a zip leaf without children. Keeps a single
// nested zip from dominating the upload's CPU/memory budget. Stored zips
// don't allocate (we sub-range the original blob), so this only applies to
// DEFLATED nested zips.
const MAX_INFLATE_BYTES = 50 * 1024 * 1024;

export type { PersistedZipEntry };

export type PersistedZipListing = {
  zip64: boolean;
  totalEntries: number;
  entries: PersistedZipEntry[];
  truncated?: boolean;
};

// Internal: holds everything we need from the central directory to either
// produce a persisted entry or recurse into the entry.
type RawEntry = {
  fileName: string;
  uncompressedSize: number;
  compressedSize: number;
  compressionMethod: number;
  localHeaderOffset: number;
  isDirectory: boolean;
};

// Abstract reader so the recursion can read bytes from either the original
// Blob, a sub-range of the original Blob (stored nested zip), or an
// in-memory buffer (deflated nested zip, after inflation).
type ByteReader = (start: number, endInclusive: number) => Promise<Uint8Array>;

function blobReader(blob: Blob): ByteReader {
  return async (s, e) => {
    const ab = await blob.slice(s, e + 1).arrayBuffer();
    return new Uint8Array(ab);
  };
}

function bufferReader(buf: Uint8Array): ByteReader {
  return (s, e) => Promise.resolve(buf.subarray(s, e + 1));
}

function subRangeReader(parent: ByteReader, baseOffset: number): ByteReader {
  return (s, e) => parent(baseOffset + s, baseOffset + e);
}

function dv(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function findEocdOffset(buf: Uint8Array): number {
  const view = dv(buf);
  for (let i = buf.length - EOCD_MIN_SIZE; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      const commentLen = view.getUint16(i + 20, true);
      if (i + EOCD_MIN_SIZE + commentLen <= buf.length) return i;
    }
  }
  return -1;
}

function readBigUint64LE(buf: Uint8Array, offset: number): number {
  // DataView returns bigint here; `as unknown as number` would only fool the
  // type checker — the first arithmetic op (e.g. `cdOffset + cdSize`) would
  // throw at runtime. ZIP64 offsets/sizes shouldn't exceed Number.MAX_SAFE_INTEGER
  // for any archive we'd realistically accept (5 GB upload cap), so converting
  // to number is safe; we still bail explicitly if the value overflows.
  const value = dv(buf).getBigUint64(offset, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('ZIP64 field exceeds JavaScript safe integer range');
  }
  return Number(value);
}

function parseCentralDirectory(
  cdBuf: Uint8Array,
  expectedCount: number,
): { entries: RawEntry[]; complete: boolean } {
  const view = dv(cdBuf);
  const decoder = new TextDecoder('utf-8');
  const entries: RawEntry[] = [];
  let p = 0;

  while (p + 46 <= cdBuf.length && entries.length < expectedCount) {
    if (view.getUint32(p, true) !== SIG_CD_HEADER) break;
    const compressionMethod = view.getUint16(p + 10, true);
    let compressedSize = view.getUint32(p + 20, true);
    let uncompressedSize = view.getUint32(p + 24, true);
    const fileNameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    let localHeaderOffset = view.getUint32(p + 42, true);
    const fileName = decoder.decode(
      cdBuf.subarray(p + 46, p + 46 + fileNameLen),
    );

    if (
      uncompressedSize === 0xffffffff ||
      compressedSize === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      const extraStart = p + 46 + fileNameLen;
      const extraEnd = extraStart + extraLen;
      let ep = extraStart;
      while (ep + 4 <= extraEnd) {
        const id = view.getUint16(ep, true);
        const size = view.getUint16(ep + 2, true);
        if (id === 0x0001) {
          let zp = ep + 4;
          if (uncompressedSize === 0xffffffff && zp + 8 <= extraEnd) {
            uncompressedSize = readBigUint64LE(cdBuf, zp);
            zp += 8;
          }
          if (compressedSize === 0xffffffff && zp + 8 <= extraEnd) {
            compressedSize = readBigUint64LE(cdBuf, zp);
            zp += 8;
          }
          if (localHeaderOffset === 0xffffffff && zp + 8 <= extraEnd) {
            localHeaderOffset = readBigUint64LE(cdBuf, zp);
            zp += 8;
          }
          break;
        }
        ep += 4 + size;
      }
    }

    entries.push({
      fileName,
      uncompressedSize,
      compressedSize,
      compressionMethod,
      localHeaderOffset,
      isDirectory: fileName.endsWith('/'),
    });

    p += 46 + fileNameLen + extraLen + commentLen;
  }

  return { entries, complete: entries.length === expectedCount };
}

// Parse a zip given a reader (Blob, sub-range, or buffer). Returns its raw
// entries plus a `complete` flag — false means the CD was malformed or
// truncated and the caller should treat the listing as partial.
async function parseZipWith(
  reader: ByteReader,
  fileSize: number,
): Promise<{
  rawEntries: RawEntry[];
  zip64: boolean;
  totalEntries: number;
  complete: boolean;
}> {
  const tailStart = Math.max(0, fileSize - EOCD_SEARCH_WINDOW);
  const tail = await reader(tailStart, fileSize - 1);
  const eocdOffsetInTail = findEocdOffset(tail);
  if (eocdOffsetInTail < 0) {
    throw new Error('EOCD signature not found');
  }
  const tailView = dv(tail);

  let cdOffset = tailView.getUint32(eocdOffsetInTail + 16, true);
  let cdSize = tailView.getUint32(eocdOffsetInTail + 12, true);
  let totalEntries = tailView.getUint16(eocdOffsetInTail + 10, true);
  let isZip64 = false;

  const needsZip64 =
    cdOffset === 0xffffffff || cdSize === 0xffffffff || totalEntries === 0xffff;

  if (needsZip64) {
    const locatorOffsetInTail = eocdOffsetInTail - 20;
    if (
      locatorOffsetInTail < 0 ||
      tailView.getUint32(locatorOffsetInTail, true) !== SIG_ZIP64_LOCATOR
    ) {
      throw new Error('ZIP64 expected but locator missing');
    }
    const zip64EocdOffset = readBigUint64LE(tail, locatorOffsetInTail + 8);
    const z64InTailStart = zip64EocdOffset - tailStart;
    let z64: Uint8Array;
    if (z64InTailStart >= 0 && z64InTailStart + 56 <= tail.length) {
      z64 = tail.subarray(z64InTailStart, z64InTailStart + 56);
    } else {
      z64 = await reader(zip64EocdOffset, zip64EocdOffset + 55);
    }
    if (dv(z64).getUint32(0, true) !== SIG_ZIP64_EOCD) {
      throw new Error('ZIP64 EOCD signature mismatch');
    }
    totalEntries = readBigUint64LE(z64, 32);
    cdSize = readBigUint64LE(z64, 40);
    cdOffset = readBigUint64LE(z64, 48);
    isZip64 = true;
  }

  let cdBuf: Uint8Array;
  const cdInTailStart = cdOffset - tailStart;
  if (cdInTailStart >= 0 && cdInTailStart + cdSize <= tail.length) {
    cdBuf = tail.subarray(cdInTailStart, cdInTailStart + cdSize);
  } else {
    cdBuf = await reader(cdOffset, cdOffset + cdSize - 1);
  }

  const { entries, complete } = parseCentralDirectory(cdBuf, totalEntries);
  return { rawEntries: entries, zip64: isZip64, totalEntries, complete };
}

async function inflateRawBytes(compressed: Uint8Array): Promise<Uint8Array> {
  // Copy into a fresh ArrayBuffer-backed view so the WritableStream signature
  // accepts it (lib.dom requires Uint8Array<ArrayBuffer>, not the generic
  // Uint8Array<ArrayBufferLike> we get back from .arrayBuffer()).
  const owned = new Uint8Array(compressed.byteLength);
  owned.set(compressed);
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  void writer.write(owned);
  void writer.close();
  const ab = await new Response(ds.readable).arrayBuffer();
  return new Uint8Array(ab);
}

// Macros to check macOS AppleDouble sidecars — they wear `.zip` extensions
// in `__MACOSX/.../._file.zip` paths but aren't real zips. Skip without
// trying to recurse so we don't log a parse failure.
function isMacOsMetadataPath(name: string): boolean {
  if (name.startsWith('__MACOSX/')) return true;
  const base = name.slice(name.lastIndexOf('/') + 1);
  if (base === '.DS_Store') return true;
  if (base.startsWith('._')) return true;
  return false;
}

// Returns a reader for the inner zip's bytes (relative to the inner zip's
// own start = 0). For STORED entries, it's a sub-range of the parent — no
// allocation. For DEFLATED, we inflate the entry once and read from a
// buffer. Returns null when the entry can't be recursed (unsupported
// compression method or too large to inflate).
async function readerForInnerZip(
  parentReader: ByteReader,
  entry: RawEntry,
): Promise<{ reader: ByteReader; size: number } | null> {
  const header = await parentReader(
    entry.localHeaderOffset,
    entry.localHeaderOffset + LOCAL_HEADER_FIXED_SIZE - 1,
  );
  if (dv(header).getUint32(0, true) !== LOCAL_HEADER_SIG) return null;
  const filenameLen = dv(header).getUint16(26, true);
  const extraLen = dv(header).getUint16(28, true);
  const dataStart =
    entry.localHeaderOffset + LOCAL_HEADER_FIXED_SIZE + filenameLen + extraLen;

  if (entry.compressionMethod === 0) {
    return {
      reader: subRangeReader(parentReader, dataStart),
      size: entry.compressedSize,
    };
  }
  if (entry.compressionMethod === 8) {
    // Guard both sides: compressedSize bounds what we'll fetch and feed to
    // the inflater, uncompressedSize (post-inflate) bounds what we hold in
    // the tab. A highly compressible inner zip can stay tiny on disk but
    // expand to hundreds of MB if we only check one side.
    if (
      entry.compressedSize > MAX_INFLATE_BYTES ||
      entry.uncompressedSize > MAX_INFLATE_BYTES
    ) {
      return null;
    }
    const compressed = await parentReader(
      dataStart,
      dataStart + entry.compressedSize - 1,
    );
    let inflated: Uint8Array;
    try {
      inflated = await inflateRawBytes(compressed);
    } catch {
      return null;
    }
    if (inflated.length > MAX_INFLATE_BYTES) return null;
    return { reader: bufferReader(inflated), size: inflated.length };
  }
  return null;
}

// Tracks how many entries the recursion has produced so far so we can stop
// before the total — across all nesting — exceeds the persisted cap.
type Budget = { used: number; max: number; truncated: boolean };

function toPersistedFromRaw(
  raw: RawEntry,
  budget: Budget,
): PersistedZipEntry | null {
  if (budget.used >= budget.max) {
    budget.truncated = true;
    return null;
  }
  budget.used++;
  const out: PersistedZipEntry = { n: raw.fileName };
  if (raw.isDirectory) out.d = true;
  else out.s = raw.uncompressedSize;
  return out;
}

async function processEntries(
  rawEntries: RawEntry[],
  reader: ByteReader,
  depth: number,
  budget: Budget,
): Promise<PersistedZipEntry[]> {
  const out: PersistedZipEntry[] = [];
  for (const raw of rawEntries) {
    if (budget.used >= budget.max) {
      budget.truncated = true;
      break;
    }
    const entry = toPersistedFromRaw(raw, budget);
    if (!entry) break;

    const looksLikeZip =
      !raw.isDirectory &&
      raw.fileName.toLowerCase().endsWith('.zip') &&
      !isMacOsMetadataPath(raw.fileName);

    if (looksLikeZip) {
      entry.z = true;
      if (depth < MAX_NESTING_DEPTH) {
        try {
          const inner = await readerForInnerZip(reader, raw);
          if (inner) {
            const parsed = await parseZipWith(inner.reader, inner.size);
            if (parsed.complete) {
              entry.c = await processEntries(
                parsed.rawEntries,
                inner.reader,
                depth + 1,
                budget,
              );
            }
          }
        } catch {
          // Inner zip failed to parse — leaf entry stays without `c`. The
          // viewer renders it with the zip icon and a "(not extracted)"
          // label so the trail is still visible.
        }
      }
    }

    out.push(entry);
  }
  return out;
}

export type ListClientOptions = {
  // Cap entries (across nesting) so very large zips don't bloat the row.
  maxEntries?: number;
};

export async function listZipEntriesFromBlob(
  file: Blob,
  opts: ListClientOptions = {},
): Promise<PersistedZipListing> {
  const maxEntries = opts.maxEntries ?? MAX_PERSISTED_ENTRIES;
  const reader = blobReader(file);
  const parsed = await parseZipWith(reader, file.size);

  const budget: Budget = { used: 0, max: maxEntries, truncated: false };
  const entries = await processEntries(parsed.rawEntries, reader, 1, budget);

  const truncated = !parsed.complete || budget.truncated;

  return {
    zip64: parsed.zip64,
    totalEntries: parsed.totalEntries,
    entries,
    ...(truncated ? { truncated: true } : {}),
  };
}
