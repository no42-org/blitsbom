/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

/**
 * Embedded-report payload: the format a CI-generated single-file report uses
 * to carry its SBOM and provenance, and the reader that hydrates from it.
 *
 * Two `<script type="application/json">` elements are spliced into the built
 * HTML before `</body>`:
 *   - `#blitsbom-report-meta` — release provenance, always raw JSON.
 *   - `#blitsbom-sbom`        — the source SBOM, `data-encoding` raw or
 *                               gzip+base64.
 *
 * `type="application/json"` means the browser parses but never executes the
 * blocks; the app reads their `textContent`.
 */

import type {
  EmbeddedPayload,
  PayloadEncoding,
  ReportProvenance,
} from '../types';

export const META_ELEMENT_ID = 'blitsbom-report-meta';
export const SBOM_ELEMENT_ID = 'blitsbom-sbom';
export const VEX_ELEMENT_ID = 'blitsbom-vex';

/**
 * Escape a JSON string for embedding inside an HTML `<script>` element by
 * replacing every `<` with its `<` JSON escape. The HTML tokenizer ends
 * script data on `</script` (case-insensitive) and `<!--` opens a comment —
 * removing every `<` byte defeats both. `<` only occurs inside JSON string
 * values (no structural JSON token contains it), where `<` is a valid
 * escape, so `JSON.parse` recovers the original text exactly.
 *
 * Shared by the generator (which writes the payload) and the round-trip
 * tests, so both agree on the transform.
 */
export function escapeJsonForScript(json: string): string {
  return json.replace(/</g, '\\u003c');
}

/**
 * Inverse of {@link escapeJsonForScript}: recover the exact pre-escape text.
 * Applied when decoding a raw block so the returned SBOM text is byte-identical
 * to the source the generator read — not just semantically equal via
 * `JSON.parse`. This matters because the recovered text is what the report
 * offers as the downloadable "original SBOM" and what its `sha256` must match.
 *
 * The transform is exact for any text with no literal `<` sequence. A
 * source that itself contains those six characters (e.g. Go's `encoding/json`
 * escapes `<` that way) cannot be disambiguated from a real `<` once escaped,
 * so the generator never uses the raw encoding for such a source — it falls
 * back to gzip+base64, which is lossless (see `resolveEncoding`). Every raw
 * payload that reaches this function therefore round-trips byte-for-byte.
 */
export function unescapeJsonFromScript(text: string): string {
  return text.replace(/\\u003c/g, '<');
}

/**
 * Build the two `<script type="application/json">` elements a report embeds,
 * as an HTML string ready to splice before `</body>`. `sbomPayload` is either
 * the raw SBOM JSON (encoding `raw`) or its base64 of gzip (encoding
 * `gzip+base64`); raw payloads are `<`-escaped here. Shared by the generator
 * and the round-trip tests so both agree on the exact output.
 */
export function buildPayloadScripts(
  sbomPayload: string,
  encoding: PayloadEncoding,
  provenance: ReportProvenance,
  vex?: { payload: string; encoding: PayloadEncoding },
): string {
  const meta = escapeJsonForScript(JSON.stringify(provenance));
  let out =
    `<script type="application/json" id="${META_ELEMENT_ID}">${meta}</script>` +
    `<script type="application/json" id="${SBOM_ELEMENT_ID}" data-encoding="${encoding}">${encodePayload(sbomPayload, encoding)}</script>`;
  if (vex) {
    out += `<script type="application/json" id="${VEX_ELEMENT_ID}" data-encoding="${vex.encoding}">${encodePayload(vex.payload, vex.encoding)}</script>`;
  }
  return out;
}

/** Raw payloads are `<`-escaped for safe embedding; gzip+base64 payloads use
 * an alphabet with no `<` and pass through untouched. */
function encodePayload(payload: string, encoding: PayloadEncoding): string {
  return encoding === 'raw' ? escapeJsonForScript(payload) : payload;
}

/** True when the runtime can gunzip a compressed payload. */
export function canDecompressGzip(): boolean {
  return typeof globalThis.DecompressionStream !== 'undefined';
}

/** Cheap presence check so the caller can paint a loading state before the
 * (potentially heavy) decode and parse. */
export function hasEmbeddedPayload(doc: Document = document): boolean {
  return (
    doc.getElementById(META_ELEMENT_ID) !== null ||
    doc.getElementById(SBOM_ELEMENT_ID) !== null
  );
}

/**
 * Read and decode the embedded payload from a document. Never throws: a
 * malformed or unusable payload resolves to `{ kind: 'error' }`, and the
 * absence of a payload to `{ kind: 'none' }`, so the caller can degrade to
 * the normal drop zone.
 */
export async function readEmbeddedPayload(
  doc: Document = document,
): Promise<EmbeddedPayload> {
  const metaEl = doc.getElementById(META_ELEMENT_ID);
  const sbomEl = doc.getElementById(SBOM_ELEMENT_ID);
  if (!metaEl && !sbomEl) return { kind: 'none' };
  if (!metaEl || !sbomEl) {
    return {
      kind: 'error',
      error: 'Report payload is incomplete: a required embedded block is missing.',
    };
  }

  let provenance: ReportProvenance;
  try {
    provenance = JSON.parse(
      unescapeJsonFromScript(metaEl.textContent ?? ''),
    ) as ReportProvenance;
  } catch (err) {
    return {
      kind: 'error',
      error: `Report provenance is not valid JSON: ${(err as Error).message}`,
    };
  }
  // Reject an envelope we do not recognise rather than rendering `undefined`
  // fields: an unknown reportFormat or a missing source digest means the file
  // is corrupt, tampered with, or from a future version.
  if (provenance?.reportFormat !== 1) {
    return {
      kind: 'error',
      error: `Unsupported report format: ${String(provenance?.reportFormat)}.`,
    };
  }
  if (typeof provenance.sourceDigest !== 'string' || !provenance.sourceDigest) {
    return {
      kind: 'error',
      error: 'Report provenance is missing its source digest.',
    };
  }

  try {
    const sbomText = await decodeElement(sbomEl);
    const vexEl = doc.getElementById(VEX_ELEMENT_ID);
    const vexText = vexEl ? await decodeElement(vexEl) : undefined;
    return vexText !== undefined
      ? { kind: 'ok', sbomText, vexText, provenance }
      : { kind: 'ok', sbomText, provenance };
  } catch (err) {
    if (err instanceof GzipUnsupportedError) {
      return { kind: 'error', error: err.message };
    }
    return {
      kind: 'error',
      error: `Could not decode the embedded payload: ${(err as Error).message}`,
    };
  }
}

class GzipUnsupportedError extends Error {}

/** Decode a payload element's content per its `data-encoding` attribute. */
async function decodeElement(el: Element): Promise<string> {
  const encoding = (el.getAttribute('data-encoding') ?? 'raw') as PayloadEncoding;
  const content = el.textContent ?? '';
  if (encoding === 'gzip+base64') {
    if (!canDecompressGzip()) {
      throw new GzipUnsupportedError(
        'This report is compressed and your browser lacks the gzip ' +
          'decompression support it needs (DecompressionStream). Use a ' +
          'browser released in 2023 or later, or load the SBOM manually.',
      );
    }
    return gunzipBase64(content.trim());
  }
  // Raw blocks were `<`-escaped at generation; reverse it so the returned
  // text is byte-identical to the source (needed for the original-SBOM
  // download and its digest), not merely JSON-equal.
  return unescapeJsonFromScript(content);
}

/** Decode base64 → gunzip → UTF-8 text using only browser primitives. */
async function gunzipBase64(base64: string): Promise<string> {
  const bytes = base64ToBytes(base64);
  // Feed the bytes through a ReadableStream constructed here rather than via
  // Blob.stream(), so the source stream comes from the same realm as
  // DecompressionStream. (Under jsdom the two differ and pipeThrough rejects;
  // in a real browser they are identical.)
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  // The DOM lib types DecompressionStream's writable side as BufferSource,
  // which does not unify with ReadableStream<Uint8Array> under strict generics
  // even though it is correct at runtime; narrow the pair explicitly.
  const gunzip = new DecompressionStream('gzip') as unknown as ReadableWritablePair<
    Uint8Array,
    Uint8Array
  >;
  const decompressed = source.pipeThrough(gunzip);
  const reader = decompressed.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return new TextDecoder().decode(concatBytes(chunks));
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
