import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSbomText } from './load';
import { classifyComponent } from '../license/classify';

const HERE = dirname(fileURLToPath(import.meta.url));
const SAMPLES = join(HERE, '..', '..', 'samples', 'opennms');

function readSample(name: string): string {
  return readFileSync(join(SAMPLES, name), 'utf8');
}

describe('SPDX parser — opennms-core sample', () => {
  // Parse once for the whole describe block — these are big files.
  const result = parseSbomText(readSample('opennms-core.json'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  if (!result.ok) return;
  const sbom = result.sbom;

  it('reports SPDX-2.3 metadata', () => {
    expect(sbom.metadata.sbomFormat).toBe('SPDX-2.x');
    expect(sbom.metadata.specVersion).toBe('SPDX-2.3');
    expect(sbom.metadata.projectName).toContain('horizon');
  });

  it('emits 2839 components from packages, ignoring files', () => {
    expect(sbom.components.length).toBe(2839);
  });

  it('resolves at least one LicenseRef back to Apache-2.0', () => {
    const apache = sbom.components.filter((c) =>
      c.licenses.some((l) => l.value === 'Apache-2.0'),
    );
    // Direct Apache-2.0 plus resolved LicenseRef-* should sum well above
    // the bare 323 direct count noted during exploration.
    expect(apache.length).toBeGreaterThan(500);
  });

  it('classifies the majority as permissive after LicenseRef resolution', () => {
    let permissive = 0;
    let undeclared = 0;
    for (const c of sbom.components) {
      const cat = classifyComponent(c.licenses);
      if (cat === 'permissive') permissive++;
      else if (cat === 'undeclared') undeclared++;
    }
    expect(permissive).toBeGreaterThan(1000);
    // Undeclared bucket shrinks but doesn't disappear (NOASSERTION sources).
    expect(undeclared).toBeGreaterThan(0);
  });
});

describe('SPDX parser — opennms-minion sample', () => {
  const result = parseSbomText(readSample('opennms-minion.json'));

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  if (!result.ok) return;

  it('emits 1339 components', () => {
    expect(result.sbom.components.length).toBe(1339);
  });
});

describe('SPDX parser — synthetic edge cases', () => {
  it('treats both NOASSERTION as no licenses', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      packages: [
        {
          name: 'foo',
          versionInfo: '1.0.0',
          licenseConcluded: 'NOASSERTION',
          licenseDeclared: 'NOASSERTION',
        },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.components[0]!.licenses).toEqual([]);
  });

  it('falls back to declared when concluded is NOASSERTION', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      packages: [
        {
          name: 'foo',
          versionInfo: '1.0.0',
          licenseConcluded: 'NOASSERTION',
          licenseDeclared: 'MIT',
        },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.components[0]!.licenses).toEqual([
      { kind: 'id', value: 'MIT' },
    ]);
  });

  it('strips SPDX supplier prefixes', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      packages: [
        {
          name: 'foo',
          versionInfo: '1.0.0',
          supplier: 'Organization: Example Inc',
          licenseConcluded: 'MIT',
        },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.components[0]!.publisher).toBe('Example Inc');
  });

  it('extracts purl from externalRefs', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      packages: [
        {
          name: 'foo',
          versionInfo: '1.0.0',
          licenseConcluded: 'MIT',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:maven/org.example/foo@1.0.0',
            },
          ],
        },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const c = result.sbom.components[0]!;
    expect(c.purl).toBe('pkg:maven/org.example/foo@1.0.0');
    expect(c.group).toBe('org.example');
  });

  it('resolves LicenseRef via signature match in extractedText', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      hasExtractedLicensingInfos: [
        {
          licenseId: 'LicenseRef-foo',
          extractedText: 'Apache License\nVersion 2.0, January 2004\n...',
        },
      ],
      packages: [
        { name: 'foo', versionInfo: '1.0.0', licenseConcluded: 'LicenseRef-foo' },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.components[0]!.licenses).toEqual([
      { kind: 'id', value: 'Apache-2.0' },
    ]);
  });

  it('resolves LicenseRef via seeAlsos URL when text is unrecognizable', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      hasExtractedLicensingInfos: [
        {
          licenseId: 'LicenseRef-bar',
          extractedText: 'placeholder text that matches nothing',
          seeAlsos: ['https://opensource.org/licenses/MIT'],
        },
      ],
      packages: [
        { name: 'bar', versionInfo: '1.0.0', licenseConcluded: 'LicenseRef-bar' },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.components[0]!.licenses).toEqual([
      { kind: 'id', value: 'MIT', url: undefined } as never,
    ]);
    // Compare omitting the url field set when no URL fallback fired.
    const lic = result.sbom.components[0]!.licenses[0]!;
    expect(lic.kind).toBe('id');
    expect(lic.value).toBe('MIT');
  });

  it('keeps unresolvable LicenseRef as a name-kind license', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      hasExtractedLicensingInfos: [
        {
          licenseId: 'LicenseRef-mystery',
          extractedText: 'some text we cannot identify',
          seeAlsos: ['https://example.com/random'],
        },
      ],
      packages: [
        {
          name: 'baz',
          versionInfo: '1.0.0',
          licenseConcluded: 'LicenseRef-mystery',
        },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const lic = result.sbom.components[0]!.licenses[0]!;
    expect(lic.kind).toBe('name');
    expect(lic.value).toBe('LicenseRef-mystery');
  });
});
