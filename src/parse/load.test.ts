import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAsVex, parseDroppedFile, parseSbomText } from './load';
import type { LoadedSbom } from '../types';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, '..', '..', 'samples', 'opennms');

function readSample(name: string): string {
  return readFileSync(join(SAMPLES, name), 'utf8');
}

describe('parseSbomText — CycloneDX', () => {
  it('accepts the prometheus-remote-writer reference SBOM (CDX 1.6)', () => {
    const result = parseSbomText(readSample('prometheus-remote-writer.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.specVersion).toBe('1.6');
    expect(result.sbom.metadata.sbomFormat).toBe('CycloneDX-1.x');
    expect(result.sbom.metadata.projectName).toBe('prometheus-remote-writer-parent');
    expect(result.sbom.metadata.vulnerabilityCount).toBe(0);
    expect(result.sbom.components.length).toBe(24);
    const first = result.sbom.components[0]!;
    expect(first.type).toBe('library');
    expect(first.licenses[0]).toEqual({ kind: 'id', value: 'Apache-2.0' });
  });

  it('rejects invalid JSON', () => {
    const result = parseSbomText('{ this is not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not valid JSON/);
  });

  it('rejects unsupported old CycloneDX versions (1.3)', () => {
    const result = parseSbomText(
      JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.3' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/CycloneDX 1\.3 is not supported/);
  });

  it('rejects unsupported future CycloneDX versions (1.7)', () => {
    const result = parseSbomText(
      JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.7' }),
    );
    expect(result.ok).toBe(false);
  });

  it('handles CDX components missing optional fields', () => {
    const doc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [{ type: 'library', name: 'minimal' }],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.sbom.components[0]!;
    expect(c.scope).toBeNull();
    expect(c.publisher).toBeNull();
    expect(c.version).toBeNull();
    expect(c.licenses).toEqual([]);
  });

  it('normalizes all four CDX license shapes', () => {
    const doc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        { type: 'library', name: 'a', licenses: [{ license: { id: 'Apache-2.0' } }] },
        { type: 'library', name: 'b', licenses: [{ license: { id: 'MIT', url: 'https://opensource.org/MIT' } }] },
        { type: 'library', name: 'c', licenses: [{ license: { name: 'Custom EULA', url: 'https://example.com' } }] },
        { type: 'library', name: 'd', licenses: [{ expression: '(MIT OR Apache-2.0)' }] },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b, c, d] = result.sbom.components;
    expect(a!.licenses[0]).toEqual({ kind: 'id', value: 'Apache-2.0' });
    expect(b!.licenses[0]).toEqual({ kind: 'id', value: 'MIT', url: 'https://opensource.org/MIT' });
    expect(c!.licenses[0]).toEqual({ kind: 'name', value: 'Custom EULA', url: 'https://example.com' });
    expect(d!.licenses[0]).toEqual({ kind: 'expression', value: '(MIT OR Apache-2.0)' });
  });
});

describe('parseSbomText — format detection', () => {
  it('rejects documents with neither bomFormat nor spdxVersion', () => {
    const result = parseSbomText(JSON.stringify({ foo: 'bar' }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Unrecognized format/);
  });

  it('routes SPDX-2.x documents to the SPDX parser', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      packages: [
        { name: 'foo', versionInfo: '1.0.0', licenseConcluded: 'MIT' },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomFormat).toBe('SPDX-2.x');
  });

  it('rejects SPDX-3.x (out of v1 scope)', () => {
    const doc = { spdxVersion: 'SPDX-3.0', packages: [] };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(false);
  });
});

describe('parseDroppedFile — VEX detection and embedded vulns', () => {
  function loadFirst(): LoadedSbom {
    const r = parseSbomText(readSample('prometheus-remote-writer.json'));
    if (!r.ok) throw new Error('fixture failed to load');
    return r.sbom;
  }

  it('treats a primary CDX SBOM as kind=sbom on first drop', () => {
    const r = parseDroppedFile(
      readSample('prometheus-remote-writer.json'),
      null,
      'sbom.json',
    );
    expect(r.kind).toBe('sbom');
  });

  it('classifies a CDX with no components and only vulns as VEX once an SBOM is loaded', () => {
    const sbom = loadFirst();
    const vexDoc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      vulnerabilities: [
        {
          id: 'CVE-FAKE-1',
          ratings: [{ severity: 'high' }],
          affects: [
            // matches one of the prometheus-remote-writer purls
            { ref: 'pkg:maven/org.xerial.snappy/snappy-java@1.1.10.8?type=jar' },
          ],
        },
      ],
    };
    const r = parseDroppedFile(JSON.stringify(vexDoc), sbom, 'vex.json');
    expect(r.kind).toBe('vex');
    if (r.kind !== 'vex') return;
    expect(r.unmatched).toBe(0);
    expect(r.sbom.vexMetadata?.sourceFilename).toBe('vex.json');
  });

  it('treats a first-drop CDX with embedded vulns as kind=sbom and merges them', () => {
    const doc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        {
          type: 'library',
          name: 'foo',
          version: '1.0',
          purl: 'pkg:npm/foo@1.0',
        },
      ],
      vulnerabilities: [
        {
          id: 'CVE-EMB-1',
          ratings: [{ severity: 'high' }],
          affects: [{ ref: 'pkg:npm/foo@1.0' }],
        },
      ],
    };
    const r = parseDroppedFile(JSON.stringify(doc), null, 'sbom.json');
    expect(r.kind).toBe('sbom');
    if (r.kind !== 'sbom') return;
    expect(r.sbom.components[0]!.vulnerabilities).toHaveLength(1);
  });

  it('SPDX is never classified as VEX even after an SBOM is loaded', () => {
    const sbom = loadFirst();
    const spdx = {
      spdxVersion: 'SPDX-2.3',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: 'another',
      packages: [],
    };
    const r = parseDroppedFile(JSON.stringify(spdx), sbom, 'other.spdx.json');
    expect(r.kind).toBe('sbom');
  });

  it('returns kind=error for invalid JSON', () => {
    const r = parseDroppedFile('{not-json', null, 'broken.json');
    expect(r.kind).toBe('error');
  });
});

describe('parseAsVex — explicit VEX-merge path', () => {
  function loadFirst(): LoadedSbom {
    const r = parseSbomText(readSample('prometheus-remote-writer.json'));
    if (!r.ok) throw new Error('fixture failed to load');
    return r.sbom;
  }

  it('merges vulnerabilities even when the dropped file is a CDX SBOM with components', () => {
    // The exact regression: a "VEX" file emitted by some tools has its
    // own components[] (often a superset of the SBOM's). The original
    // heuristic in parseDroppedFile would treat it as a primary SBOM
    // and replace the loaded one. parseAsVex must not.
    const sbom = loadFirst();
    const dropped = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      // Many components — looks like a primary SBOM by raw shape.
      components: Array.from({ length: 100 }, (_, i) => ({
        type: 'library',
        name: `noise-${i}`,
        version: '0.0.0',
      })),
      vulnerabilities: [
        {
          id: 'CVE-X',
          ratings: [{ severity: 'high' }],
          affects: [
            { ref: 'pkg:maven/org.xerial.snappy/snappy-java@1.1.10.8?type=jar' },
          ],
        },
      ],
    };
    const r = parseAsVex(JSON.stringify(dropped), sbom, 'minion.vex.json');
    expect(r.kind).toBe('vex');
    if (r.kind !== 'vex') return;
    // Components from the loaded SBOM remain intact (24 of them).
    expect(r.sbom.components.length).toBe(24);
    expect(r.sbom.vexMetadata?.totalVulns).toBe(1);
  });

  it('errors on a CDX without vulnerabilities[]', () => {
    const sbom = loadFirst();
    const dropped = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [],
    };
    const r = parseAsVex(JSON.stringify(dropped), sbom, 'oops.json');
    expect(r.kind).toBe('error');
  });

  it('errors on SPDX (no vex concept)', () => {
    const sbom = loadFirst();
    const spdx = {
      spdxVersion: 'SPDX-2.3',
      SPDXID: 'SPDXRef-DOCUMENT',
      name: 'x',
      packages: [],
    };
    const r = parseAsVex(JSON.stringify(spdx), sbom, 'foo.spdx.json');
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.error).toMatch(/SPDX/);
    }
  });

  it('errors on invalid JSON', () => {
    const sbom = loadFirst();
    const r = parseAsVex('{garbage', sbom, 'broken.json');
    expect(r.kind).toBe('error');
  });
});
