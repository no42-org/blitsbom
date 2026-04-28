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
    scope: 'required',
    purl: 'pkg:maven/org.example/thing@1.0.0',
    licenses: [{ kind: 'id', value: 'Apache-2.0' }],
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
});

describe('buildCsvFilename', () => {
  const fixedDate = new Date('2026-04-27T12:00:00Z');

  it('includes project name and ISO date', () => {
    const md: SbomMetadata = {
      projectName: 'prometheus-remote-writer',
      timestamp: null,
      specVersion: '1.6',
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
      vulnerabilityCount: 0,
    };
    expect(buildCsvFilename(md, fixedDate)).toBe(
      'my-project-edge-2026-04-27.csv',
    );
  });
});
