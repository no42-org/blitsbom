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

  // 2839 packages minus the described image root, which is lifted to the
  // header rather than listed as a component (#145).
  it('emits 2838 components from packages, ignoring files', () => {
    expect(sbom.components.length).toBe(2838);
  });

  it('does not list the scan target as a component', () => {
    const target = sbom.metadata.projectName;
    expect(target).not.toBeNull();
    expect(sbom.components.some((c) => c.name === target)).toBe(false);
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

  it('emits 1338 components', () => {
    expect(result.sbom.components.length).toBe(1338);
  });
});

// Document-root lifting (#145). SPDX keeps the document's subject inside
// packages[]; CycloneDX keeps it outside components[]. The sole DESCRIBES
// target is lifted so both formats agree, without matching any generator's
// id convention.

function spdxDoc(extra: Record<string, unknown>): string {
  return JSON.stringify({
    spdxVersion: 'SPDX-2.3',
    name: 'scan-target',
    packages: [
      { SPDXID: 'SPDXRef-DocumentRoot-Directory-.', name: '.' },
      { SPDXID: 'SPDXRef-Package-foo', name: 'foo', versionInfo: '1.0.0' },
      { SPDXID: 'SPDXRef-Package-bar', name: 'bar', versionInfo: '2.0.0' },
    ],
    ...extra,
  });
}

function describesRel(target: string, from = 'SPDXRef-DOCUMENT') {
  return {
    spdxElementId: from,
    relatedSpdxElement: target,
    relationshipType: 'DESCRIBES',
  };
}

function namesOf(text: string): string[] {
  const result = parseSbomText(text);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('parse failed');
  return result.sbom.components.map((c) => c.name);
}

describe('SPDX document-root lifting', () => {
  it('lifts the sole DESCRIBES target out of the component list', () => {
    const names = namesOf(
      spdxDoc({
        relationships: [describesRel('SPDXRef-DocumentRoot-Directory-.')],
      }),
    );
    expect(names).toEqual(['foo', 'bar']);
  });

  it('accepts the documentDescribes shorthand', () => {
    const names = namesOf(
      spdxDoc({ documentDescribes: ['SPDXRef-DocumentRoot-Directory-.'] }),
    );
    expect(names).toEqual(['foo', 'bar']);
  });

  it('prefers relationships over documentDescribes when they disagree', () => {
    const names = namesOf(
      spdxDoc({
        relationships: [describesRel('SPDXRef-Package-foo')],
        documentDescribes: ['SPDXRef-DocumentRoot-Directory-.'],
      }),
    );
    expect(names).toEqual(['.', 'bar']);
  });

  it('lifts nothing when the document describes several packages', () => {
    const names = namesOf(
      spdxDoc({
        relationships: [
          describesRel('SPDXRef-DocumentRoot-Directory-.'),
          describesRel('SPDXRef-Package-foo'),
        ],
      }),
    );
    expect(names).toEqual(['.', 'foo', 'bar']);
  });

  it('lifts nothing when the document describes nothing', () => {
    expect(namesOf(spdxDoc({}))).toEqual(['.', 'foo', 'bar']);
  });

  it('never empties the table for a single-package document', () => {
    const doc = JSON.stringify({
      spdxVersion: 'SPDX-2.3',
      name: 'solo',
      packages: [{ SPDXID: 'SPDXRef-Only', name: 'solo', versionInfo: '1.0' }],
      relationships: [describesRel('SPDXRef-Only')],
    });
    expect(namesOf(doc)).toEqual(['solo']);
  });

  it('ignores a DESCRIBES target that matches no package', () => {
    const names = namesOf(
      spdxDoc({ relationships: [describesRel('SPDXRef-Missing')] }),
    );
    expect(names).toEqual(['.', 'foo', 'bar']);
  });

  it('ignores DESCRIBES relationships not rooted at the document', () => {
    const names = namesOf(
      spdxDoc({
        relationships: [
          describesRel('SPDXRef-DocumentRoot-Directory-.', 'SPDXRef-Package-foo'),
        ],
      }),
    );
    expect(names).toEqual(['.', 'foo', 'bar']);
  });

  it('survives malformed relationship entries', () => {
    const names = namesOf(
      spdxDoc({
        relationships: [null, 'nonsense', {}, 42, describesRel(7 as never)],
      }),
    );
    expect(names).toEqual(['.', 'foo', 'bar']);
  });

  it('lifts the root in SPDX 2.2, which has no primaryPackagePurpose', () => {
    const raw = readFileSync(
      join(HERE, '..', '..', 'samples', 'syft', 'alpine-spdx-json-2.2.json'),
      'utf8',
    );
    const before = JSON.parse(raw).packages.length;
    const result = parseSbomText(raw);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.components.length).toBe(before - 1);
    expect(result.sbom.components.some((c) => c.name === 'alpine')).toBe(false);
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

  it('extracts product version from the package matching the document name', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'acme-platform',
      packages: [
        { name: 'some-dep', versionInfo: '9.9.9' },
        { name: 'acme-platform', versionInfo: '2.4.1' },
      ],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.productVersion).toBe('2.4.1');
  });

  it('leaves product version null when no package matches the document name', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'acme-platform',
      packages: [{ name: 'some-dep', versionInfo: '9.9.9' }],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.productVersion).toBeNull();
  });

  it('extracts the Tool creator, ignoring Person and Organization', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      creationInfo: {
        created: '2026-07-23T10:00:00Z',
        creators: [
          'Person: Jane Doe',
          'Organization: Acme Inc',
          'Tool: syft-1.18.1',
        ],
      },
      packages: [{ name: 'foo', versionInfo: '1.0.0' }],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomTool).toBe('syft-1.18.1');
  });

  it('leaves sbomTool null when creators carry no Tool entry', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      creationInfo: { creators: ['Person: Jane Doe'] },
      packages: [{ name: 'foo', versionInfo: '1.0.0' }],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomTool).toBeNull();
  });
});

describe('SPDX originator precedence (#169)', () => {
  /** One package, parsed. No DESCRIBES, so document-root lifting is inert. */
  function single(pkg: Record<string, unknown>) {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'tiny',
      packages: [{ name: 'foo', versionInfo: '1.0.0', ...pkg }],
    };
    const result = parseSbomText(JSON.stringify(doc));
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('parse failed');
    return result.sbom.components[0]!;
  }

  const purlRef = (locator: string) => ({
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: locator,
      },
    ],
  });

  it('prefers a declared originator over supplier and namespace', () => {
    const c = single({
      originator: 'Organization: FasterXML',
      supplier: 'Organization: Someone Else',
      ...purlRef('pkg:maven/com.fasterxml.jackson.core/jackson-databind@2.17.0'),
    });
    expect(c.originator).toBe('FasterXML');
  });

  it('prefers a declared supplier over the namespace', () => {
    const c = single({
      supplier: 'Organization: Example Inc',
      ...purlRef('pkg:maven/com.google.guava/guava@33.0'),
    });
    expect(c.originator).toBe('Example Inc');
  });

  it('falls back to the namespace when neither is declared', () => {
    const c = single(purlRef('pkg:maven/com.google.guava/guava@33.0'));
    expect(c.originator).toBe('com.google.guava');
  });

  it('falls through NOASSERTION at both declared tiers', () => {
    const c = single({
      originator: 'NOASSERTION',
      supplier: 'NOASSERTION',
      ...purlRef('pkg:maven/io.dropwizard.metrics/metrics-core@4.2.25'),
    });
    expect(c.originator).toBe('io.dropwizard.metrics');
  });

  it('is null with nothing declared and no purl', () => {
    expect(single({}).originator).toBe(null);
  });

  it('is null when the purl has no namespace', () => {
    const c = single(purlRef('pkg:pypi/requests@2.31.0'));
    expect(c.originator).toBe(null);
  });

  it('takes the full golang namespace without disturbing group', () => {
    const c = single(purlRef('pkg:golang/github.com/gorilla/mux@v1.8.0'));
    expect(c.originator).toBe('github.com/gorilla');
    // The table's group column keeps its first-segment behaviour.
    expect(c.group).toBe('github.com');
  });
});

describe('SPDX originator fixture — samples/opennms/spdx-originator.json', () => {
  const result = parseSbomText(readSample('spdx-originator.json'));

  function originatorOfPackage(name: string): string | null {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('parse failed');
    const c = result.sbom.components.find((x) => x.name === name);
    expect(c, `no component named ${name}`).toBeDefined();
    return c!.originator;
  }

  it('parses successfully', () => {
    expect(result.ok).toBe(true);
  });

  it('attributes each ecosystem from its namespace', () => {
    expect(originatorOfPackage('guava')).toBe('com.google.guava');
    expect(originatorOfPackage('github.com/gorilla/mux')).toBe(
      'github.com/gorilla',
    );
    expect(originatorOfPackage('@angular/core')).toBe('@angular');
    expect(originatorOfPackage('musl')).toBe('alpine');
  });

  it('keeps a declared originator ahead of the namespace', () => {
    expect(originatorOfPackage('jackson-databind')).toBe('FasterXML');
  });

  it('leaves only genuinely unattributable packages Unknown', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const unknown = result.sbom.components
      .filter((c) => c.originator === null)
      .map((c) => c.name);
    // requests has a namespaceless purl; mystery-blob has no purl at all.
    expect(unknown.sort()).toEqual(['mystery-blob', 'requests']);
  });

  it('documents the accepted fragmentation trade', () => {
    // One organisation, two slices: jackson-databind declares a vendor and
    // jackson-jr-objects does not, so the declared name and the namespace
    // sit side by side. Accepted rather than fixed; see the proposal. (#169)
    expect(originatorOfPackage('jackson-databind')).toBe('FasterXML');
    expect(originatorOfPackage('jackson-jr-objects')).toBe(
      'com.fasterxml.jackson.jr',
    );
  });
});

describe('SPDX graph-root lifting (#167)', () => {
  const result = parseSbomText(readSample('spdx-graph-roots.json'));

  function names(): string[] {
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('parse failed');
    return result.sbom.components.map((c) => c.name).sort();
  }

  it('lifts the sole graph root and the DESCRIBES scan target, keeping the rest', () => {
    expect(names()).toEqual([
      'dep-a',
      'dep-b',
      'example-workspace',
      'golang-orphan',
      'golang.org/x/mod',
      'left-pad',
      'sub-dep',
    ]);
  });

  // One test per clause, each against a package that ONLY that clause saves.
  // Mutation-checked: deleting any single clause from findGraphRoots fails at
  // least one of these. The previous fixture failed that check — `orphan-leaf`
  // carried an npm purl so clause 1 masked clause 3, and `dep-b` had no
  // dependant so clause 3 masked clause 4.
  it('clause 1 — keeps an npm package with the graph-root shape', () => {
    expect(names()).toContain('example-workspace');
  });

  it('clause 2 — keeps a golang graph root that carries a version', () => {
    expect(names()).toContain('golang.org/x/mod');
  });

  it('clause 3 — keeps a versionless golang package nothing depends on', () => {
    expect(names()).toContain('golang-orphan');
  });

  it('clause 4 — keeps a versionless golang package that is itself a dependency', () => {
    expect(names()).toContain('dep-b');
  });
});

describe('SPDX graph-root lifting — several roots lift nothing (#176 review)', () => {
  const go = (id: string, name: string, version?: string) => ({
    SPDXID: id,
    name,
    ...(version === undefined ? {} : { versionInfo: version }),
    externalRefs: [
      {
        referenceCategory: 'PACKAGE-MANAGER',
        referenceType: 'purl',
        referenceLocator: `pkg:golang/${name}`,
      },
    ],
  });

  it('keeps vendored third-party modules when several roots match', () => {
    // A monorepo or a vendored source tree yields several versionless main
    // modules. Lifting all of them deleted real components; the rule now
    // refuses, mirroring findDocumentRootId.
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'scan',
      packages: [
        go('v1', 'github.com/vendor/other-project', 'UNKNOWN'),
        go('v2', 'github.com/vendor/second', 'UNKNOWN'),
        go('d', 'shared-dep', '1.0.0'),
      ],
      relationships: [
        {
          spdxElementId: 'd',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'v1',
        },
        {
          spdxElementId: 'd',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'v2',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual([
      'github.com/vendor/other-project',
      'github.com/vendor/second',
      'shared-dep',
    ]);
  });

  it('consumes DEPENDS_ON as well as DEPENDENCY_OF', () => {
    // X DEPENDS_ON Y means Y is a dependency of X. Reading only DEPENDENCY_OF
    // left Y looking like a graph root and deleted it.
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'mixed',
      packages: [go('X', 'X', '1.0'), go('Y', 'Y', 'UNKNOWN'), go('Z', 'Z', '1.0')],
      relationships: [
        {
          spdxElementId: 'X',
          relationshipType: 'DEPENDS_ON',
          relatedSpdxElement: 'Y',
        },
        {
          spdxElementId: 'Z',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'Y',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual(['X', 'Y', 'Z']);
  });

  it('ignores a dependency edge whose subject is not a listed package', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'ghost',
      packages: [go('root', 'github.com/x/app', 'UNKNOWN'), go('o', 'other', '1.0')],
      relationships: [
        {
          spdxElementId: 'ghost',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'root',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual([
      'github.com/x/app',
      'other',
    ]);
  });

  it('never empties the component list', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'scan',
      documentDescribes: ['S'],
      packages: [
        { SPDXID: 'S', name: '.' },
        go('R', 'github.com/x/app', 'UNKNOWN'),
      ],
      relationships: [
        {
          spdxElementId: 'S',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'R',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.length).toBeGreaterThan(0);
  });

  it('keeps a versioned package sharing an SPDXID with a lifted root', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'dup',
      packages: [
        go('SPDXRef-X', 'github.com/x/app', 'UNKNOWN'),
        { ...go('SPDXRef-X', 'real-pkg', '2.0.0') },
        go('d', 'dep', '1.0'),
      ],
      relationships: [
        {
          spdxElementId: 'd',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'SPDXRef-X',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name)).toContain('real-pkg');
  });

  it.each([
    ['(devel)', true],
    ['noassertion', false],
    ['NoAssertion', false],
    [' UNKNOWN ', false],
  ])('version %j is kept as a component: %s', (versionInfo, kept) => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'v',
      packages: [
        go('r', 'github.com/x/app', versionInfo as string),
        go('d', 'dep', '1.0'),
      ],
      relationships: [
        {
          spdxElementId: 'd',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'r',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.some((c) => c.name === 'github.com/x/app')).toBe(
      kept,
    );
  });

  it('keeps a package whose versionInfo is a non-string', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'malformed',
      packages: [
        { ...go('r', 'github.com/x/app'), versionInfo: 0 },
        go('d', 'dep', '1.0'),
      ],
      relationships: [
        {
          spdxElementId: 'd',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'r',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name)).toContain('github.com/x/app');
  });

  it('reads a purl from an uppercase referenceType, and past an empty locator', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'refs',
      packages: [
        {
          SPDXID: 'r',
          name: 'github.com/x/app',
          versionInfo: 'UNKNOWN',
          externalRefs: [
            { referenceType: 'purl', referenceLocator: '' },
            { referenceType: 'PURL', referenceLocator: 'pkg:golang/github.com/x/app' },
          ],
        },
        go('d', 'dep', '1.0'),
      ],
      relationships: [
        {
          spdxElementId: 'd',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'r',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name)).toEqual(['dep']);
  });
});

describe('SPDX graph-root lifting — the gitdep regression (#167)', () => {
  /**
   * Reproduces real syft output for a git devDependency that has a transitive
   * dependency. It is versionless (git refs carry no version), has a dependant
   * of its own, and is a dependency of nothing — syft emits no root→devDep
   * edge. Under the original three-clause rule this real component was
   * silently deleted. Only the golang restriction saves it.
   */
  const doc = {
    spdxVersion: 'SPDX-2.3',
    name: 'gitdep-case',
    packages: [
      {
        SPDXID: 'SPDXRef-GitDep',
        name: 'gitdep',
        versionInfo: 'UNKNOWN',
        downloadLocation: 'git+ssh://git@github.com/example/gitdep.git#deadbeef',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: 'pkg:npm/gitdep',
          },
        ],
      },
      {
        SPDXID: 'SPDXRef-TinyHelper',
        name: 'tiny-helper',
        versionInfo: '1.2.3',
        externalRefs: [
          {
            referenceCategory: 'PACKAGE-MANAGER',
            referenceType: 'purl',
            referenceLocator: 'pkg:npm/tiny-helper@1.2.3',
          },
        ],
      },
    ],
    relationships: [
      {
        spdxElementId: 'SPDXRef-TinyHelper',
        relationshipType: 'DEPENDENCY_OF',
        relatedSpdxElement: 'SPDXRef-GitDep',
      },
    ],
  };

  it('keeps a versionless npm git dependency that has dependants', () => {
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual([
      'gitdep',
      'tiny-helper',
    ]);
  });

  it('still lifts the same shape when the purl type is golang', () => {
    const golang = JSON.parse(JSON.stringify(doc));
    golang.packages[0]!.externalRefs[0]!.referenceLocator =
      'pkg:golang/github.com/example/gitdep';
    const r = parseSbomText(JSON.stringify(golang));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name)).toEqual(['tiny-helper']);
  });

  it('keeps a versionless package with no purl at all', () => {
    const noPurl = JSON.parse(JSON.stringify(doc));
    delete noPurl.packages[0]!.externalRefs;
    const r = parseSbomText(JSON.stringify(noPurl));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual([
      'gitdep',
      'tiny-helper',
    ]);
  });
});

describe('SPDX graph-root lifting — robustness', () => {
  it('matches the purl type case-insensitively, per the purl spec', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'mixed-case',
      packages: [
        {
          SPDXID: 'SPDXRef-Root',
          name: 'root',
          versionInfo: 'UNKNOWN',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:GoLang/example.com/root',
            },
          ],
        },
        { SPDXID: 'SPDXRef-Dep', name: 'dep', versionInfo: '1.0.0' },
      ],
      relationships: [
        {
          spdxElementId: 'SPDXRef-Dep',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'SPDXRef-Root',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name)).toEqual(['dep']);
  });

  it('does not throw on packages with no SPDXID', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'no-id',
      packages: [
        { name: 'anonymous', versionInfo: 'UNKNOWN' },
        { SPDXID: 'SPDXRef-Dep', name: 'dep', versionInfo: '1.0.0' },
      ],
      relationships: [
        {
          spdxElementId: 'SPDXRef-Dep',
          relationshipType: 'DEPENDENCY_OF',
          relatedSpdxElement: 'SPDXRef-Missing',
        },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual([
      'anonymous',
      'dep',
    ]);
  });
});
