import { describe, expect, it } from 'vitest';
import {
  applyVexToSbom,
  isLive,
  normalizeCdxVulnerability,
  normalizeCdxVulnerabilities,
  pickSeverityAndScore,
} from './vex';
import type { CdxVulnerability, Component, LoadedSbom } from '../types';

function comp(overrides: Partial<Component> = {}): Component {
  return {
    type: 'library',
    group: null,
    name: 'test',
    version: '1.0.0',
    description: null,
    publisher: null,
    originator: null,
    scope: null,
    purl: null,
    purlCanonical: null,
    bomRef: null,
    licenses: [],
    vulnerabilities: [],
    ...overrides,
  };
}

function sbom(components: Component[]): LoadedSbom {
  return {
    metadata: {
      projectName: 'test',
      timestamp: null,
      specVersion: '1.6',
      sbomFormat: 'CycloneDX-1.x',
      vulnerabilityCount: 0,
    },
    components,
  };
}

describe('pickSeverityAndScore', () => {
  it('returns unknown when ratings is empty / missing', () => {
    expect(pickSeverityAndScore(undefined)).toEqual({ severity: 'unknown' });
    expect(pickSeverityAndScore([])).toEqual({ severity: 'unknown' });
  });

  it('takes the highest severity across multiple ratings', () => {
    const r = pickSeverityAndScore([
      { severity: 'low', score: 3.1, method: 'CVSSv3' },
      { severity: 'high', score: 7.5, method: 'CVSSv3' },
      { severity: 'medium', score: 5.0, method: 'CVSSv3' },
    ]);
    expect(r.severity).toBe('high');
  });

  it('prefers a CVSSv3 score even when not the first rating', () => {
    const r = pickSeverityAndScore([
      { severity: 'high', score: 9.0, method: 'CVSSv2' },
      { severity: 'high', score: 7.5, method: 'CVSSv3' },
    ]);
    expect(r.cvssScore).toBe(7.5);
  });

  it('falls back to any scored rating when no CVSSv3 is present', () => {
    const r = pickSeverityAndScore([
      { severity: 'medium', score: 5.5, method: 'CVSSv2' },
    ]);
    expect(r.cvssScore).toBe(5.5);
  });

  it('collapses CDX info severity to internal low', () => {
    const r = pickSeverityAndScore([{ severity: 'info' }]);
    expect(r.severity).toBe('low');
  });
});

describe('normalizeCdxVulnerability', () => {
  it('returns null when id is missing', () => {
    expect(normalizeCdxVulnerability({} as CdxVulnerability)).toBe(null);
    expect(normalizeCdxVulnerability({ id: '' })).toBe(null);
  });

  it('normalizes id, source, severity, and score', () => {
    const v = normalizeCdxVulnerability({
      id: 'CVE-2024-0001',
      source: { name: 'NVD' },
      ratings: [{ severity: 'high', score: 7.5, method: 'CVSSv3' }],
    });
    expect(v).toEqual({
      id: 'CVE-2024-0001',
      source: 'NVD',
      severity: 'high',
      cvssScore: 7.5,
    });
  });

  it('maps CDX analysis.state to internal VexStatus', () => {
    const v = normalizeCdxVulnerability({
      id: 'CVE-X',
      analysis: { state: 'not_affected', justification: 'code_not_reachable' },
    });
    expect(v?.status).toBe('not_affected');
    expect(v?.justification).toBe('code_not_reachable');
  });

  it('drops unrecognized analysis.state but preserves the id', () => {
    const v = normalizeCdxVulnerability({
      id: 'CVE-X',
      analysis: { state: 'something-weird' as never },
    });
    expect(v?.status).toBeUndefined();
  });

  it('takes URL from advisories when source has no url', () => {
    const v = normalizeCdxVulnerability({
      id: 'GHSA-foo',
      advisories: [{ url: 'https://github.com/advisories/GHSA-foo' }],
    });
    expect(v?.url).toBe('https://github.com/advisories/GHSA-foo');
  });
});

describe('isLive', () => {
  it('treats no status as live', () => {
    expect(isLive({ id: 'X', source: 's', severity: 'low' })).toBe(true);
  });
  it('exploitable / in_triage are live', () => {
    expect(
      isLive({ id: 'X', source: 's', severity: 'low', status: 'exploitable' }),
    ).toBe(true);
    expect(
      isLive({ id: 'X', source: 's', severity: 'low', status: 'in_triage' }),
    ).toBe(true);
  });
  it('not_affected, false_positive, resolved, resolved_with_pedigree are suppressed', () => {
    for (const status of [
      'not_affected',
      'false_positive',
      'resolved',
      'resolved_with_pedigree',
    ] as const) {
      expect(
        isLive({ id: 'X', source: 's', severity: 'low', status }),
      ).toBe(false);
    }
  });
});

describe('normalizeCdxVulnerabilities', () => {
  it('returns [] for non-array input', () => {
    expect(normalizeCdxVulnerabilities(undefined)).toEqual([]);
  });
  it('skips records without an id', () => {
    expect(
      normalizeCdxVulnerabilities([
        { id: 'CVE-A', ratings: [{ severity: 'low' }] },
        { id: '' },
        { id: 'CVE-B', ratings: [{ severity: 'high' }] },
      ]),
    ).toHaveLength(2);
  });
});

describe('applyVexToSbom — join logic', () => {
  it('joins by canonical purl', () => {
    const c = comp({
      name: 'foo',
      purl: 'pkg:maven/org.example/foo@1.0?type=jar',
      purlCanonical: 'pkg:maven/org.example/foo@1.0?type=jar',
    });
    const r = applyVexToSbom(
      sbom([c]),
      [
        {
          id: 'CVE-X',
          ratings: [{ severity: 'high' }],
          // VEX writes the purl with extra qualifier — should still match
          // after canonicalization.
          affects: [
            {
              ref: 'pkg:maven/org.example/foo@1.0?type=jar&classifier=sources',
            },
          ],
        },
      ],
      'vex.json',
      null,
    );
    expect(r.sbom.components[0]!.vulnerabilities).toHaveLength(1);
    expect(r.unmatched).toBe(0);
  });

  it('falls back to bom-ref when ref is not a purl', () => {
    const c = comp({ name: 'foo', bomRef: 'bom-ref-1' });
    const r = applyVexToSbom(
      sbom([c]),
      [
        {
          id: 'CVE-X',
          ratings: [{ severity: 'medium' }],
          affects: [{ ref: 'bom-ref-1' }],
        },
      ],
      'vex.json',
      null,
    );
    expect(r.sbom.components[0]!.vulnerabilities).toHaveLength(1);
    expect(r.unmatched).toBe(0);
  });

  it('counts unmatched vulnerabilities', () => {
    const c = comp({ name: 'foo', purlCanonical: 'pkg:npm/foo@1.0' });
    const r = applyVexToSbom(
      sbom([c]),
      [
        {
          id: 'CVE-A',
          ratings: [{ severity: 'low' }],
          affects: [{ ref: 'pkg:npm/foo@1.0' }],
        },
        {
          id: 'CVE-B',
          ratings: [{ severity: 'low' }],
          affects: [{ ref: 'pkg:npm/missing@2.0' }],
        },
        {
          id: 'CVE-C',
          ratings: [{ severity: 'low' }],
          affects: [{ ref: 'totally-unknown' }],
        },
      ],
      'vex.json',
      null,
    );
    expect(r.unmatched).toBe(2);
    expect(r.sbom.components[0]!.vulnerabilities).toHaveLength(1);
  });

  it('handles a vuln that affects multiple components', () => {
    const a = comp({
      name: 'a',
      purlCanonical: 'pkg:npm/lib@1.0',
    });
    const b = comp({
      name: 'b',
      purlCanonical: 'pkg:npm/lib@1.0',
    });
    const r = applyVexToSbom(
      sbom([a, b]),
      [
        {
          id: 'CVE-X',
          ratings: [{ severity: 'high' }],
          affects: [{ ref: 'pkg:npm/lib@1.0' }],
        },
      ],
      'vex.json',
      null,
    );
    expect(r.sbom.components[0]!.vulnerabilities).toHaveLength(1);
    expect(r.sbom.components[1]!.vulnerabilities).toHaveLength(1);
  });

  it('does not mutate the input SBOM', () => {
    const c = comp({ name: 'foo', purlCanonical: 'pkg:npm/foo@1.0' });
    const original = sbom([c]);
    applyVexToSbom(
      original,
      [
        {
          id: 'CVE-X',
          ratings: [{ severity: 'high' }],
          affects: [{ ref: 'pkg:npm/foo@1.0' }],
        },
      ],
      'vex.json',
      null,
    );
    expect(original.components[0]!.vulnerabilities).toEqual([]);
  });

  it('records suppressed and unmatched counts in vexMetadata', () => {
    const c = comp({ name: 'foo', purlCanonical: 'pkg:npm/foo@1.0' });
    const r = applyVexToSbom(
      sbom([c]),
      [
        {
          id: 'CVE-A',
          ratings: [{ severity: 'high' }],
          affects: [{ ref: 'pkg:npm/foo@1.0' }],
          analysis: { state: 'not_affected' },
        },
        {
          id: 'CVE-B',
          ratings: [{ severity: 'high' }],
          affects: [{ ref: 'pkg:npm/missing' }],
        },
      ],
      'sample.vex.json',
      '2026-04-28T00:00:00Z',
    );
    expect(r.sbom.vexMetadata).toEqual({
      timestamp: '2026-04-28T00:00:00Z',
      sourceFilename: 'sample.vex.json',
      totalVulns: 2,
      suppressedByStatus: 1,
      unmatched: 1,
    });
  });
});
