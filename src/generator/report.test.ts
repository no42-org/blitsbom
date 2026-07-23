/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  buildReport,
  chooseEncoding,
  defaultFilename,
  ReportError,
  COMPRESS_THRESHOLD_BYTES,
} from './report';
import { generateReport } from './run';
import { main } from './cli';
import { readEmbeddedPayload } from '../parse/payload';
import { parseSbomText } from '../parse/load';
import type { Component } from '../types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, '..', '..', 'samples', 'opennms');
const TEMPLATE = '<!doctype html><html><body><div id="app"></div></body></html>';

function readSample(name: string): string {
  return readFileSync(join(SAMPLES, name), 'utf8');
}

function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function distinctLicenses(components: Component[]): Set<string> {
  const set = new Set<string>();
  for (const c of components) for (const l of c.licenses) set.add(l.value);
  return set;
}

function distinctOriginators(components: Component[]): number {
  const set = new Set<string>();
  for (const c of components) if (c.originator) set.add(c.originator);
  return set.size;
}

/** Parse a generated report's HTML and hydrate it exactly as the browser
 * would, returning the reconstructed component list. */
async function hydrate(html: string): Promise<Component[]> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const payload = await readEmbeddedPayload(doc);
  if (payload.kind !== 'ok') throw new Error(`hydrate failed: ${payload.kind}`);
  const parsed = parseSbomText(payload.sbomText);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.sbom.components;
}

describe('generate → hydrate parity', () => {
  for (const sample of ['prometheus-remote-writer.json', 'spdx-synthetic.json']) {
    it(`round-trips ${sample} with identical data`, async () => {
      const text = readSample(sample);
      const direct = parseSbomText(text);
      expect(direct.ok).toBe(true);
      if (!direct.ok) return;

      const report = buildReport({
        templateHtml: TEMPLATE,
        sbomText: text,
        sourceDigest: sha256(text),
      });
      const hydrated = await hydrate(report.html);

      expect(hydrated.length).toBe(direct.sbom.components.length);
      expect(distinctLicenses(hydrated)).toEqual(
        distinctLicenses(direct.sbom.components),
      );
      expect(distinctOriginators(hydrated)).toBe(
        distinctOriginators(direct.sbom.components),
      );
    });
  }
});

describe('original SBOM is recoverable byte-for-byte', () => {
  it('preserves a raw SBOM containing "<" through generation and hydration', async () => {
    const source = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        { type: 'library', name: 'x', author: 'A B <a@b.co>', 'bom-ref': 'r' },
      ],
    });
    const report = buildReport({
      templateHtml: TEMPLATE,
      sbomText: source,
      sourceDigest: sha256(source),
    });
    const doc = new DOMParser().parseFromString(report.html, 'text/html');
    const payload = await readEmbeddedPayload(doc);
    expect(payload.kind).toBe('ok');
    if (payload.kind !== 'ok') return;
    // What "Download original SBOM" would write must equal the source, and its
    // digest must match what the header advertises.
    expect(payload.sbomText).toBe(source);
    expect(sha256(payload.sbomText)).toBe(report.provenance.sourceDigest);
  });
});

describe('validation failures', () => {
  it('throws on invalid JSON', () => {
    expect(() =>
      buildReport({
        templateHtml: TEMPLATE,
        sbomText: 'not json',
        sourceDigest: 'sha256:x',
      }),
    ).toThrow(ReportError);
  });

  it('throws on an unsupported CycloneDX version', () => {
    const doc = JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.2' });
    expect(() =>
      buildReport({ templateHtml: TEMPLATE, sbomText: doc, sourceDigest: 'sha256:x' }),
    ).toThrow(ReportError);
  });

  it('main() returns non-zero and writes nothing on a bad SBOM', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blitsbom-gen-'));
    const badPath = join(dir, 'bad.json');
    const tplPath = join(dir, 'tpl.html');
    const outPath = join(dir, 'out.html');
    writeFileSync(badPath, 'not json');
    writeFileSync(tplPath, TEMPLATE);
    const code = main([badPath, '--template', tplPath, '--output', outPath]);
    expect(code).toBe(1);
    expect(existsSync(outPath)).toBe(false);
  });
});

describe('content is never a gate', () => {
  it('embeds an SBOM with a copyleft license and a critical vuln, exit zero', () => {
    const doc = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        {
          type: 'library',
          name: 'gpl-thing',
          version: '1.0.0',
          'bom-ref': 'ref-1',
          licenses: [{ license: { id: 'GPL-3.0-only' } }],
        },
      ],
      vulnerabilities: [
        {
          id: 'CVE-2026-0001',
          'bom-ref': 'ref-1',
          affects: [{ ref: 'ref-1' }],
          ratings: [{ severity: 'critical' }],
        },
      ],
    });
    const report = buildReport({
      templateHtml: TEMPLATE,
      sbomText: doc,
      sourceDigest: sha256(doc),
    });
    expect(report.summary).toContain('components');
  });
});

describe('encoding selection', () => {
  it('uses raw below the threshold and gzip at/above it', () => {
    const small = 'x'.repeat(10);
    const big = 'x'.repeat(COMPRESS_THRESHOLD_BYTES);
    expect(chooseEncoding(small, 'auto')).toBe('raw');
    expect(chooseEncoding(big, 'auto')).toBe('gzip+base64');
  });

  it('honours --compress always and never', () => {
    const small = 'x'.repeat(10);
    const big = 'x'.repeat(COMPRESS_THRESHOLD_BYTES);
    expect(chooseEncoding(small, 'always')).toBe('gzip+base64');
    expect(chooseEncoding(big, 'never')).toBe('raw');
  });
});

describe('provenance and filename', () => {
  it('records a digest matching the source file bytes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blitsbom-gen-'));
    const sbomPath = join(dir, 'bom.json');
    const tplPath = join(dir, 'tpl.html');
    const bytes = readSample('prometheus-remote-writer.json');
    writeFileSync(sbomPath, bytes);
    writeFileSync(tplPath, TEMPLATE);
    const result = generateReport({
      sbomPath,
      templatePath: tplPath,
      outputPath: join(dir, 'out.html'),
    });
    const expected = `sha256:${createHash('sha256')
      .update(readFileSync(sbomPath))
      .digest('hex')}`;
    expect(result.provenance.sourceDigest).toBe(expected);
    expect(existsSync(result.outputPath)).toBe(true);
  });

  it('omits provenance fields that were not supplied', () => {
    const doc = JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.6' });
    const report = buildReport({
      templateHtml: TEMPLATE,
      sbomText: doc,
      sourceDigest: 'sha256:x',
    });
    expect('project' in report.provenance).toBe(false);
    expect('commit' in report.provenance).toBe(false);
    expect('buildUrl' in report.provenance).toBe(false);
  });

  it('slugifies the default filename', () => {
    expect(defaultFilename('Acme Platform', '2.4.1')).toBe(
      'acme-platform-2.4.1-sbom.html',
    );
    expect(defaultFilename(undefined, undefined)).toBe('sbom-sbom.html');
  });
});

describe('generation-time VEX', () => {
  const SBOM = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [
      { type: 'library', name: 'foo', version: '1.0.0', 'bom-ref': 'ref-1' },
    ],
  });
  const VEX = JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    vulnerabilities: [
      {
        id: 'CVE-2026-1234',
        'bom-ref': 'v1',
        affects: [{ ref: 'ref-1' }],
        ratings: [{ severity: 'high' }],
      },
    ],
  });

  it('embeds the SBOM verbatim and merges the VEX at hydration', async () => {
    const report = buildReport({
      templateHtml: TEMPLATE,
      sbomText: SBOM,
      sourceDigest: sha256(SBOM),
      vexText: VEX,
      vexDigest: sha256(VEX),
      vexFilename: 'vex.json',
    });
    // Provenance carries both digests.
    expect(report.provenance.vexDigest).toBe(sha256(VEX));
    // The embedded SBOM block is byte-identical to the source (downloadable).
    const doc = new DOMParser().parseFromString(report.html, 'text/html');
    const payload = await readEmbeddedPayload(doc);
    expect(payload.kind).toBe('ok');
    if (payload.kind !== 'ok') return;
    expect(payload.sbomText).toBe(SBOM);
    expect(payload.vexText).toBe(VEX);
    // Hydrating with the merge applied surfaces the vulnerability.
    const parsed = parseSbomText(payload.sbomText);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { parseAsVex } = await import('../parse/load');
    const merged = parseAsVex(payload.vexText!, parsed.sbom, 'vex.json');
    expect(merged.kind).toBe('vex');
    if (merged.kind !== 'vex') return;
    const withVuln = merged.sbom.components.find(
      (c) => c.vulnerabilities.length > 0,
    );
    expect(withVuln?.vulnerabilities[0]?.id).toBe('CVE-2026-1234');
  });

  it('fails generation when the VEX is not a CycloneDX document', () => {
    expect(() =>
      buildReport({
        templateHtml: TEMPLATE,
        sbomText: SBOM,
        sourceDigest: sha256(SBOM),
        vexText: '{"not":"a bom"}',
        vexDigest: 'sha256:x',
      }),
    ).toThrow(ReportError);
  });
});

describe('large SBOM (opennms-core) end to end', () => {
  it('compresses far below the source size and hydrates every component', async () => {
    const text = readSample('opennms-core.json');
    const report = buildReport({
      templateHtml: TEMPLATE,
      sbomText: text,
      sourceDigest: sha256(text),
      project: 'opennms',
      version: 'core',
    });
    // Report must be a fraction of the 29 MB source.
    expect(report.html.length).toBeLessThan(text.length / 2);
    expect(report.summary).toContain('gzip+base64');
    const hydrated = await hydrate(report.html);
    expect(hydrated.length).toBe(2839);
  });
});
