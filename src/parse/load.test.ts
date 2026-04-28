import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSbomText } from './load';

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
