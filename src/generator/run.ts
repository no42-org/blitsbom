/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

/**
 * IO layer for the report generator: read the source files, compute their
 * digests from the exact bytes on disk (before any parsing), delegate to the
 * pure `buildReport`, and write the output. Kept separate from `report.ts` so
 * both can be tested without a subprocess.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { buildReport, ReportError } from './report';
import type { BuildReportResult, CompressMode } from './report';

export interface GenerateOptions {
  sbomPath: string;
  templatePath: string;
  vexPath?: string;
  outputPath?: string;
  compress?: CompressMode;
  project?: string;
  version?: string;
  commit?: string;
  buildUrl?: string;
  builtAt?: string;
}

export interface GenerateResult extends BuildReportResult {
  /** Absolute path the report was written to. */
  outputPath: string;
}

/** Read sources, build the report, and write it. Throws `ReportError` on any
 * condition that should fail the pipeline (missing/invalid input). */
export function generateReport(opts: GenerateOptions): GenerateResult {
  const sbomBytes = readSource(opts.sbomPath, 'SBOM');
  const templateHtml = readSource(opts.templatePath, 'template').toString(
    'utf8',
  );

  const vexBytes = opts.vexPath ? readSource(opts.vexPath, 'VEX') : undefined;

  const result = buildReport({
    templateHtml,
    sbomText: sbomBytes.toString('utf8'),
    sourceDigest: sha256(sbomBytes),
    sbomFilename: basename(opts.sbomPath),
    vexText: vexBytes ? vexBytes.toString('utf8') : undefined,
    vexDigest: vexBytes ? sha256(vexBytes) : undefined,
    vexFilename: opts.vexPath ? basename(opts.vexPath) : undefined,
    compress: opts.compress,
    project: opts.project,
    version: opts.version,
    commit: opts.commit,
    buildUrl: opts.buildUrl,
    builtAt: opts.builtAt,
  });

  const outputPath = resolve(opts.outputPath ?? result.filename);
  writeFileSync(outputPath, result.html, 'utf8');

  return { ...result, outputPath };
}

function readSource(path: string, label: string): Buffer {
  try {
    return readFileSync(path);
  } catch (err) {
    throw new ReportError(
      `Could not read ${label} at ${path}: ${(err as Error).message}`,
    );
  }
}

/** `sha256:<hex>` over the exact bytes, matching `sha256sum`. */
function sha256(bytes: Buffer): string {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
