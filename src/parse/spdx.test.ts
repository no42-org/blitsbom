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

  it('lifts both golang graph roots and the DESCRIBES scan target, keeping the rest', () => {
    expect(names()).toEqual([
      'dep-a',
      'dep-b',
      'example-workspace',
      'golang.org/x/mod',
      'left-pad',
      'orphan-leaf',
      'sub-dep',
      'tool-dep',
    ]);
  });

  it('keeps an npm package with the graph-root shape (clause 1)', () => {
    // example-workspace is versionless, has dependants of its own and is a
    // dependency of nothing — it satisfies clauses 2-4 exactly like a Go main
    // module. Only the purl type saves it. This is the `gitdep` case that
    // blocked the original three-clause rule: a git devDependency arrives
    // versionless, and deleting it would silently shrink a signed artifact.
    expect(names()).toContain('example-workspace');
  });

  it('keeps a near miss saved only by its version (clause 2)', () => {
    // golang.org/x/mod satisfies clauses 2 and 3 exactly like a graph root.
    // Only the version separates them. This is the whole safety margin.
    expect(names()).toContain('golang.org/x/mod');
  });

  it('keeps a versionless package that is itself a dependency (clause 4)', () => {
    expect(names()).toContain('dep-b');
  });

  it('keeps a versionless package nothing depends on (clause 3)', () => {
    // The scan-target stand-in has the same shape and is lifted by the
    // DESCRIBES rule instead — the two rules are disjoint.
    expect(names()).toContain('orphan-leaf');
  });

  it('lifts nothing when the document declares no relationships', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'no-rels',
      packages: [
        { SPDXID: 'SPDXRef-A', name: 'a', versionInfo: 'UNKNOWN' },
        { SPDXID: 'SPDXRef-B', name: 'b', versionInfo: '1.0.0' },
      ],
    };
    const r = parseSbomText(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual(['a', 'b']);
  });

  it('skips malformed relationship entries without throwing', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'malformed',
      packages: [
        {
          SPDXID: 'SPDXRef-Root',
          name: 'root',
          versionInfo: 'UNKNOWN',
          externalRefs: [
            {
              referenceCategory: 'PACKAGE-MANAGER',
              referenceType: 'purl',
              referenceLocator: 'pkg:golang/example.com/root',
            },
          ],
        },
        { SPDXID: 'SPDXRef-Dep', name: 'dep', versionInfo: '1.0.0' },
      ],
      relationships: [
        null,
        'nonsense',
        { relationshipType: 'DEPENDENCY_OF' },
        { spdxElementId: 42, relationshipType: 'DEPENDENCY_OF' },
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

  it('does not lift a graph root that carries a version', () => {
    const doc = {
      spdxVersion: 'SPDX-2.3',
      name: 'versioned-root',
      packages: [
        { SPDXID: 'SPDXRef-Root', name: 'workspace', versionInfo: '0.0.0' },
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
    // The npm workspace-root case: nl6-docs is exactly this and must survive.
    expect(r.sbom.components.map((c) => c.name).sort()).toEqual([
      'dep',
      'workspace',
    ]);
  });

  it('does not attribute a lifted root in the originator rollup', () => {
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const origins = new Set(
      result.sbom.components.map((c) => c.originator).filter(Boolean),
    );
    expect(origins.has('github.com/example/app')).toBe(false);
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
