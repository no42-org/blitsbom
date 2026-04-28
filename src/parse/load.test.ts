import { describe, expect, it } from 'vitest';
import { parseSbomText } from './load';
import referenceBom from '../../test-fixtures/reference-bom.json';

describe('parseSbomText', () => {
  it('accepts the reference CycloneDX 1.6 SBOM', () => {
    const result = parseSbomText(JSON.stringify(referenceBom));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.specVersion).toBe('1.6');
    expect(result.sbom.metadata.projectName).toBe('prometheus-remote-writer-parent');
    expect(result.sbom.metadata.vulnerabilityCount).toBe(0);
    expect(result.sbom.components.length).toBe(24);
    const first = result.sbom.components[0]!;
    expect(first.name).toBeTruthy();
    expect(first.type).toBe('library');
    expect(first.licenses[0]).toEqual({ kind: 'id', value: 'Apache-2.0' });
  });

  it('rejects invalid JSON', () => {
    const result = parseSbomText('{ this is not json');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/not valid JSON/);
  });

  it('rejects non-object top-level JSON', () => {
    const result = parseSbomText('[]');
    expect(result.ok).toBe(false);
  });

  it('rejects documents without bomFormat=CycloneDX', () => {
    const result = parseSbomText(
      JSON.stringify({ bomFormat: 'SPDX', specVersion: '1.6' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Only CycloneDX/);
  });

  it('rejects unsupported old versions (1.3)', () => {
    const result = parseSbomText(
      JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.3' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/1\.3 is not supported/);
  });

  it('rejects unsupported future versions (1.7)', () => {
    const result = parseSbomText(
      JSON.stringify({ bomFormat: 'CycloneDX', specVersion: '1.7' }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/1\.7 is not supported/);
  });

  it('handles components missing optional fields', () => {
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

  it('normalizes all four license shapes', () => {
    const doc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [
        {
          type: 'library',
          name: 'a',
          licenses: [{ license: { id: 'Apache-2.0' } }],
        },
        {
          type: 'library',
          name: 'b',
          licenses: [
            { license: { id: 'MIT', url: 'https://opensource.org/MIT' } },
          ],
        },
        {
          type: 'library',
          name: 'c',
          licenses: [
            { license: { name: 'Custom EULA', url: 'https://example.com' } },
          ],
        },
        {
          type: 'library',
          name: 'd',
          licenses: [{ expression: '(MIT OR Apache-2.0)' }],
        },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [a, b, c, d] = result.sbom.components;
    expect(a!.licenses[0]).toEqual({ kind: 'id', value: 'Apache-2.0' });
    expect(b!.licenses[0]).toEqual({
      kind: 'id',
      value: 'MIT',
      url: 'https://opensource.org/MIT',
    });
    expect(c!.licenses[0]).toEqual({
      kind: 'name',
      value: 'Custom EULA',
      url: 'https://example.com',
    });
    expect(d!.licenses[0]).toEqual({
      kind: 'expression',
      value: '(MIT OR Apache-2.0)',
    });
  });

  it('preserves vulnerability count when present', () => {
    const doc = {
      bomFormat: 'CycloneDX',
      specVersion: '1.6',
      components: [],
      vulnerabilities: [{ id: 'CVE-1' }, { id: 'CVE-2' }, { id: 'CVE-3' }],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.vulnerabilityCount).toBe(3);
  });
});
