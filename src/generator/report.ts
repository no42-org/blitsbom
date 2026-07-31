/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

/**
 * Report generator core: turn a source SBOM (and optional VEX) plus release
 * provenance into a self-contained single-file HTML report, by embedding the
 * payload into the built application template.
 *
 * This layer is pure over strings and precomputed digests so it is trivially
 * testable; file IO, argument parsing, and process exit live in `run.ts` and
 * `cli.ts`. It reuses the browser's own parser (`parseSbomText`, `parseAsVex`)
 * so a report can never disagree with what drag-and-drop would show.
 */

import { gzipSync } from 'node:zlib';
import { parseSbomText, parseAsVex } from '../parse/load';
import { buildPayloadScripts } from '../parse/payload';
import { artifactBaseName } from '../parse/util';
import { formatSpecLabel } from '../parse/specLabel';
import type { PayloadEncoding, ReportProvenance, SbomMetadata } from '../types';

/** SBOMs below this on-disk size embed as raw JSON (human-inspectable);
 * larger ones compress so the report stays a mailable size. */
export const COMPRESS_THRESHOLD_BYTES = 2 * 1024 * 1024;

export type CompressMode = 'auto' | 'always' | 'never';

export interface BuildReportInput {
  /** The built single-file app (`dist/index.html`) to embed into. */
  templateHtml: string;
  sbomText: string;
  /** `sha256:<hex>` of the source SBOM bytes as read from disk. */
  sourceDigest: string;
  sbomFilename?: string;
  vexText?: string;
  /** `sha256:<hex>` of the VEX bytes; required when `vexText` is set. */
  vexDigest?: string;
  vexFilename?: string;
  compress?: CompressMode;
  project?: string;
  version?: string;
  commit?: string;
  buildUrl?: string;
  builtAt?: string;
}

export interface BuildReportResult {
  html: string;
  /** Default output filename, `<project>-<version>-sbom.html` slugified. */
  filename: string;
  /** One-line human summary for the CI log. */
  summary: string;
  provenance: ReportProvenance;
}

/** Thrown for any condition that must fail generation (bad SBOM, bad VEX,
 * unusable template). The CLI turns this into a non-zero exit. */
export class ReportError extends Error {}

export function buildReport(input: BuildReportInput): BuildReportResult {
  const compress = input.compress ?? 'auto';

  // Parse + validate through the same path the browser uses.
  const parsed = parseSbomText(input.sbomText);
  if (!parsed.ok) throw new ReportError(parsed.error);
  let sbom = parsed.sbom;

  // Validate an optional VEX by performing the same merge the browser will
  // perform at hydration, so a broken VEX fails generation rather than the
  // recipient's viewer.
  if (input.vexText !== undefined) {
    if (!input.vexDigest) {
      throw new ReportError('Internal: vexText supplied without vexDigest.');
    }
    const merged = parseAsVex(
      input.vexText,
      sbom,
      input.vexFilename ?? 'vex',
    );
    if (merged.kind === 'error') throw new ReportError(merged.error);
    sbom = merged.sbom;
  }

  const provenance: ReportProvenance = {
    reportFormat: 1,
    sourceDigest: input.sourceDigest,
  };
  setIfPresent(provenance, 'project', input.project);
  setIfPresent(provenance, 'version', input.version);
  setIfPresent(provenance, 'commit', input.commit);
  setIfPresent(provenance, 'buildUrl', input.buildUrl);
  setIfPresent(provenance, 'builtAt', input.builtAt);
  setIfPresent(provenance, 'sourceFilename', input.sbomFilename);
  if (input.vexText !== undefined) {
    setIfPresent(provenance, 'vexDigest', input.vexDigest);
    setIfPresent(provenance, 'vexFilename', input.vexFilename);
  }

  const sbomEncoding = resolveEncoding(input.sbomText, compress);
  const scripts = buildPayloadScripts(
    compressIfGzip(input.sbomText, sbomEncoding),
    sbomEncoding,
    provenance,
    input.vexText !== undefined
      ? (() => {
          const vexEncoding = resolveEncoding(input.vexText!, compress);
          return {
            payload: compressIfGzip(input.vexText!, vexEncoding),
            encoding: vexEncoding,
          };
        })()
      : undefined,
  );

  const html = spliceBeforeBody(input.templateHtml, scripts);

  const filename = defaultFilename(input.project, input.version);
  const summary = buildSummary(
    sbom.metadata,
    sbom.components.length,
    distinctLicenseCount(sbom.components),
    sbomEncoding,
  );

  return { html, filename, summary, provenance };
}

/** Return the text unchanged for `raw`, or gzip+base64 for `gzip+base64`. The
 * `<`-escaping of raw JSON is applied later, in `buildPayloadScripts`. */
function compressIfGzip(text: string, encoding: PayloadEncoding): string {
  return encoding === 'raw'
    ? text
    : gzipSync(Buffer.from(text, 'utf8')).toString('base64');
}

export function chooseEncoding(
  text: string,
  mode: CompressMode,
): PayloadEncoding {
  if (mode === 'never') return 'raw';
  if (mode === 'always') return 'gzip+base64';
  return Buffer.byteLength(text, 'utf8') >= COMPRESS_THRESHOLD_BYTES
    ? 'gzip+base64'
    : 'raw';
}

/**
 * Encoding actually used, after the size choice. A raw payload embeds the JSON
 * with every `<` escaped to `<` and reversed on read; that reversal is not
 * byte-exact if the source itself already contains the literal text `<`
 * (as Go's `encoding/json` emits for `<`), because the two are indistinguishable
 * once escaped. Rather than corrupt the downloadable original, compress such a
 * source instead — gzip+base64 is always lossless. `--compress never` is an
 * explicit override and is left untouched.
 */
export function resolveEncoding(
  text: string,
  mode: CompressMode,
): PayloadEncoding {
  const chosen = chooseEncoding(text, mode);
  if (chosen === 'raw' && mode !== 'never' && !rawRoundTrips(text)) {
    return 'gzip+base64';
  }
  return chosen;
}

/** A raw embed round-trips byte-for-byte unless the source already contains a
 * literal `<` sequence, which the `<`→`<` escape cannot disambiguate. */
function rawRoundTrips(text: string): boolean {
  return !text.includes('\\u003c');
}

function spliceBeforeBody(template: string, scripts: string): string {
  const marker = '</body>';
  const idx = template.lastIndexOf(marker);
  if (idx === -1) {
    throw new ReportError(
      'Report template has no </body> to inject the payload before.',
    );
  }
  return template.slice(0, idx) + scripts + template.slice(idx);
}

export function defaultFilename(
  project: string | undefined,
  version: string | undefined,
): string {
  return `${artifactBaseName(project, version)}-sbom.html`;
}

function buildSummary(
  metadata: SbomMetadata,
  componentCount: number,
  licenseCount: number,
  encoding: PayloadEncoding,
): string {
  const format = formatSpecLabel(metadata);
  return (
    `embedded ${componentCount} components · ${licenseCount} licenses · ` +
    `${format} · ${encoding}`
  );
}

function distinctLicenseCount(
  components: { licenses: { value: string }[] }[],
): number {
  const set = new Set<string>();
  for (const c of components) {
    for (const l of c.licenses) set.add(l.value);
  }
  return set.size;
}

function setIfPresent<K extends keyof ReportProvenance>(
  target: ReportProvenance,
  key: K,
  value: string | undefined,
): void {
  const trimmed = value?.trim();
  if (trimmed) target[key] = trimmed as ReportProvenance[K];
}
