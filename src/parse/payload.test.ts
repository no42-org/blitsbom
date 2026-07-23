/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { gzipSync } from 'node:zlib';
import {
  buildPayloadScripts,
  canDecompressGzip,
  readEmbeddedPayload,
} from './payload';
import type { PayloadEncoding, ReportProvenance } from '../types';

const PROVENANCE: ReportProvenance = {
  reportFormat: 1,
  project: 'acme-platform',
  version: '2.4.1',
  sourceDigest: 'sha256:deadbeef',
};

/**
 * Build a full HTML document containing the report payload the generator
 * would emit, then parse it back through the HTML tokenizer so tests exercise
 * the real escaping path rather than a shortcut.
 */
function parseWithPayload(
  sbomPayload: string,
  encoding: PayloadEncoding,
  provenance: ReportProvenance = PROVENANCE,
): Document {
  const scripts = buildPayloadScripts(sbomPayload, encoding, provenance);
  const html = `<!doctype html><html><body><div id="app"></div>${scripts}</body></html>`;
  return new DOMParser().parseFromString(html, 'text/html');
}

function gzipBase64(json: string): string {
  return gzipSync(Buffer.from(json, 'utf8')).toString('base64');
}

describe('readEmbeddedPayload', () => {
  it('returns none when no payload is present', async () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><body></body></html>',
      'text/html',
    );
    expect(await readEmbeddedPayload(doc)).toEqual({ kind: 'none' });
  });

  it('round-trips a raw payload', async () => {
    const sbom = { bomFormat: 'CycloneDX', specVersion: '1.6' };
    const doc = parseWithPayload(JSON.stringify(sbom), 'raw');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(JSON.parse(result.sbomText)).toEqual(sbom);
    expect(result.provenance.version).toBe('2.4.1');
  });

  it('recovers a raw SBOM byte-identically when it contains "<"', async () => {
    // The common Name <email> author/supplier pattern puts a literal '<' in
    // the source; the escape applied at generation must be fully reversed so
    // the returned text (used for the original-SBOM download) matches source.
    const source = JSON.stringify({
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        {
          type: 'library',
          name: 'x',
          author: 'John Doe <john@example.com>',
          description: 'has </script> and <!-- markers -->',
        },
      ],
    });
    const doc = parseWithPayload(source, 'raw');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    // Byte-identity, not just JSON equality.
    expect(result.sbomText).toBe(source);
  });

  it('rejects an unsupported report format', async () => {
    const html =
      '<!doctype html><html><body>' +
      '<script type="application/json" id="blitsbom-report-meta">{"reportFormat":2,"sourceDigest":"sha256:x"}</script>' +
      '<script type="application/json" id="blitsbom-sbom" data-encoding="raw">{}</script>' +
      '</body></html>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('error');
  });

  it('rejects provenance with no source digest', async () => {
    const html =
      '<!doctype html><html><body>' +
      '<script type="application/json" id="blitsbom-report-meta">{"reportFormat":1}</script>' +
      '<script type="application/json" id="blitsbom-sbom" data-encoding="raw">{}</script>' +
      '</body></html>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('error');
  });

  it('round-trips a gzip+base64 payload', async () => {
    const sbom = { bomFormat: 'CycloneDX', specVersion: '1.6', components: [] };
    const doc = parseWithPayload(gzipBase64(JSON.stringify(sbom)), 'gzip+base64');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('ok');
    if (result.kind !== 'ok') return;
    expect(JSON.parse(result.sbomText)).toEqual(sbom);
  });

  it('errors when only one block is present', async () => {
    const doc = new DOMParser().parseFromString(
      '<!doctype html><html><body><script type="application/json" id="blitsbom-sbom" data-encoding="raw">{}</script></body></html>',
      'text/html',
    );
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('error');
  });

  it('errors on malformed provenance JSON', async () => {
    const html =
      '<!doctype html><html><body>' +
      '<script type="application/json" id="blitsbom-report-meta">{not json</script>' +
      '<script type="application/json" id="blitsbom-sbom" data-encoding="raw">{}</script>' +
      '</body></html>';
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('error');
  });

  it('errors on undecodable gzip data', async () => {
    const doc = parseWithPayload('not-valid-base64-gzip!!!', 'gzip+base64');
    const result = await readEmbeddedPayload(doc);
    expect(result.kind).toBe('error');
  });

  it('errors with an actionable message when DecompressionStream is absent', async () => {
    const saved = globalThis.DecompressionStream;
    // @ts-expect-error — simulate an old browser
    delete globalThis.DecompressionStream;
    try {
      expect(canDecompressGzip()).toBe(false);
      const doc = parseWithPayload(gzipBase64('{}'), 'gzip+base64');
      const result = await readEmbeddedPayload(doc);
      expect(result.kind).toBe('error');
      if (result.kind !== 'error') return;
      expect(result.error).toMatch(/DecompressionStream/);
    } finally {
      globalThis.DecompressionStream = saved;
    }
  });
});

describe('script-tag escaping is injection-proof', () => {
  const HAZARDS = ['</script>', '</SCRIPT >', '<!--', '-->', '<script>', '<'];

  for (const hazard of HAZARDS) {
    it(`round-trips a payload containing ${JSON.stringify(hazard)}`, async () => {
      const sbom = {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        components: [{ type: 'library', name: 'x', description: hazard }],
      };
      const doc = parseWithPayload(JSON.stringify(sbom), 'raw');
      const result = await readEmbeddedPayload(doc);
      expect(result.kind).toBe('ok');
      if (result.kind !== 'ok') return;
      expect(JSON.parse(result.sbomText)).toEqual(sbom);
    });
  }

  it('survives arbitrary strings that mix tag and comment delimiters', async () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.stringMatching(/^[\x20-\x7e]*$/).map((s) => `${s}</script><!--${s}-->`),
          { maxLength: 5 },
        ),
        (descriptions) => {
          const sbom = {
            bomFormat: 'CycloneDX',
            specVersion: '1.6',
            components: descriptions.map((d, i) => ({
              type: 'library',
              name: `c${i}`,
              description: d,
            })),
          };
          const scripts = buildPayloadScripts(
            JSON.stringify(sbom),
            'raw',
            PROVENANCE,
          );
          const html = `<!doctype html><html><body>${scripts}</body></html>`;
          const doc = new DOMParser().parseFromString(html, 'text/html');
          // Read synchronously-decodable raw payload for the property check.
          const el = doc.getElementById('blitsbom-sbom');
          expect(el).not.toBeNull();
          expect(JSON.parse(el!.textContent ?? '')).toEqual(sbom);
        },
      ),
      { numRuns: 200 },
    );
  });
});

afterEach(() => {
  // No global mutation leaks between tests beyond the guarded block above.
});
