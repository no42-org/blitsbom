import { describe, expect, it } from 'vitest';
import { buildCsv, buildCsvFilename, CSV_COLUMNS } from './csv';
import type { Component, SbomMetadata } from '../types';

function lib(overrides: Partial<Component> = {}): Component {
  return {
    type: 'library',
    group: 'org.example',
    name: 'thing',
    version: '1.0.0',
    description: null,
    publisher: null,
    originator: null,
    scope: 'required',
    purl: 'pkg:maven/org.example/thing@1.0.0',
    purlCanonical: 'pkg:maven/org.example/thing@1.0.0',
    bomRef: null,
    licenses: [{ kind: 'id', value: 'Apache-2.0' }],
    vulnerabilities: [],
    ...overrides,
  };
}

describe('buildCsv', () => {
  it('emits a header row first', () => {
    const csv = buildCsv([]);
    expect(csv).toBe(CSV_COLUMNS.join(',') + '\r\n');
  });

  it('uses CRLF line endings', () => {
    const csv = buildCsv([lib()]);
    expect(csv.includes('\r\n')).toBe(true);
    expect(csv.split('\r\n').length).toBe(3); // header + 1 row + trailing
  });

  it('quotes fields containing commas', () => {
    const csv = buildCsv([lib({ description: null, name: 'thing,with,commas' })]);
    expect(csv).toContain('"thing,with,commas"');
  });

  it('quotes fields containing double quotes and doubles them', () => {
    const csv = buildCsv([lib({ name: 'has "quotes" inside' })]);
    expect(csv).toContain('"has ""quotes"" inside"');
  });

  it('quotes fields containing newlines', () => {
    const csv = buildCsv([lib({ publisher: 'line1\nline2' })]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('joins multiple licenses with semicolon-space', () => {
    const csv = buildCsv([
      lib({
        licenses: [
          { kind: 'id', value: 'Apache-2.0' },
          { kind: 'id', value: 'MIT' },
        ],
      }),
    ]);
    expect(csv).toContain('Apache-2.0; MIT');
  });

  it('exports the full Component model (description, originator, bom-ref)', () => {
    const csv = buildCsv([
      lib({
        description: 'A small example library',
        originator: 'Example Org',
        bomRef: 'pkg-1',
      }),
    ]);
    const dataRow = csv.split('\r\n')[1]!;
    expect(dataRow).toContain('A small example library');
    expect(dataRow).toContain('Example Org');
    expect(dataRow).toContain('pkg-1');
  });

  it('emits a single row with empty vuln columns when a component has no vulns', () => {
    const csv = buildCsv([lib()]);
    const lines = csv.split('\r\n');
    // header + 1 data row + trailing
    expect(lines.length).toBe(3);
    const fields = lines[1]!.split(',');
    // The last 7 columns are the per-vuln fields and should all be empty.
    expect(fields.slice(-7)).toEqual(['', '', '', '', '', '', '']);
  });

  it('emits one row per vulnerability for components carrying many', () => {
    const csv = buildCsv([
      lib({
        vulnerabilities: [
          {
            id: 'CVE-A',
            source: 'NVD',
            severity: 'critical',
            cvssScore: 9.8,
            url: 'https://nvd.nist.gov/vuln/detail/CVE-A',
          },
          { id: 'CVE-B', source: 'GHSA', severity: 'high' },
          { id: 'CVE-C', source: 'OSV', severity: 'low' },
        ],
      }),
    ]);
    const lines = csv.split('\r\n');
    // header + 3 vuln rows + trailing
    expect(lines.length).toBe(5);
    expect(lines[1]).toContain('CVE-A');
    expect(lines[1]).toContain('critical');
    expect(lines[1]).toContain('9.8');
    expect(lines[1]).toContain('https://nvd.nist.gov/vuln/detail/CVE-A');
    expect(lines[2]).toContain('CVE-B');
    expect(lines[2]).toContain('GHSA');
    expect(lines[3]).toContain('CVE-C');
  });

  it('repeats the parent component fields across each vuln row', () => {
    const csv = buildCsv([
      lib({
        name: 'libwidget',
        group: 'org.widget',
        vulnerabilities: [
          { id: 'CVE-A', source: 'NVD', severity: 'critical' },
          { id: 'CVE-B', source: 'NVD', severity: 'low' },
        ],
      }),
    ]);
    const [, row1, row2] = csv.split('\r\n');
    expect(row1!).toMatch(/^libwidget,org\.widget,/);
    expect(row2!).toMatch(/^libwidget,org\.widget,/);
  });

  it('exports VEX status and URL when present', () => {
    const csv = buildCsv([
      lib({
        vulnerabilities: [
          {
            id: 'CVE-X',
            source: 'NVD',
            severity: 'critical',
            status: 'not_affected',
            url: 'https://example.org/advisory/CVE-X',
          },
        ],
      }),
    ]);
    const dataRow = csv.split('\r\n')[1]!;
    expect(dataRow).toContain('not_affected');
    expect(dataRow).toContain('https://example.org/advisory/CVE-X');
  });
});

describe('buildCsvFilename', () => {
  const fixedDate = new Date('2026-04-27T12:00:00Z');

  it('includes project name and ISO date', () => {
    const md: SbomMetadata = {
      projectName: 'prometheus-remote-writer',
      timestamp: null,
      specVersion: '1.6',
      sbomFormat: 'CycloneDX-1.x',
      vulnerabilityCount: 0,
    };
    expect(buildCsvFilename(md, fixedDate)).toBe(
      'prometheus-remote-writer-2026-04-27.csv',
    );
  });

  it('falls back to blitsbom-export when project name is missing', () => {
    const md: SbomMetadata = {
      projectName: null,
      timestamp: null,
      specVersion: '1.6',
      sbomFormat: 'CycloneDX-1.x',
      vulnerabilityCount: 0,
    };
    expect(buildCsvFilename(md, fixedDate)).toBe(
      'blitsbom-export-2026-04-27.csv',
    );
  });

  it('slugifies project names with unsafe characters', () => {
    const md: SbomMetadata = {
      projectName: 'My Project / Edge!',
      timestamp: null,
      specVersion: '1.6',
      sbomFormat: 'CycloneDX-1.x',
      vulnerabilityCount: 0,
    };
    expect(buildCsvFilename(md, fixedDate)).toBe(
      'my-project-edge-2026-04-27.csv',
    );
  });
});
