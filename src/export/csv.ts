import type { Component, SbomMetadata } from '../types';

export const CSV_COLUMNS = [
  // Component identity / metadata.
  'Name',
  'Group',
  'Version',
  'Type',
  'Scope',
  'Publisher',
  'Originator',
  'Description',
  'License',
  'purl',
  'bom-ref',
  // Per-vulnerability columns (one row per vulnerability; component
  // fields above repeat across the vuln's rows). For components with
  // no vulnerabilities, a single row is emitted with these blank.
  'VulnId',
  'VulnSeverity',
  'VulnSource',
  'VulnCvssScore',
  'VulnStatus',
  'VulnUrl',
  'VulnDescription',
] as const;

const CRLF = '\r\n';

/**
 * Build an RFC 4180-compliant CSV string from a list of components.
 *
 * Denormalized layout — each vulnerability gets its own row with the
 * parent component's fields repeated. A component with N vulnerabilities
 * produces N rows; a component with no vulnerabilities produces a
 * single row with the per-vuln columns left blank. This makes the
 * export trivial to filter / pivot in spreadsheet tools.
 *
 * Quotes fields containing commas, double quotes, or newlines.
 * Uses CRLF line endings as required by RFC 4180.
 */
export function buildCsv(components: readonly Component[]): string {
  const rows: string[] = [CSV_COLUMNS.map(escape).join(',')];
  const EMPTY_VULN_FIELDS = ['', '', '', '', '', '', ''];
  for (const c of components) {
    const compFields: string[] = [
      c.name,
      c.group ?? '',
      c.version ?? '',
      c.type,
      c.scope ?? '',
      c.publisher ?? '',
      c.originator ?? '',
      c.description ?? '',
      c.licenses.map((l) => l.value).join('; '),
      c.purl ?? '',
      c.bomRef ?? '',
    ];
    if (c.vulnerabilities.length === 0) {
      rows.push([...compFields, ...EMPTY_VULN_FIELDS].map(escape).join(','));
    } else {
      for (const v of c.vulnerabilities) {
        rows.push(
          [
            ...compFields,
            v.id,
            v.severity,
            v.source,
            v.cvssScore !== undefined ? String(v.cvssScore) : '',
            v.status ?? '',
            v.url ?? '',
            v.description ?? '',
          ]
            .map(escape)
            .join(','),
        );
      }
    }
  }
  return rows.join(CRLF) + CRLF;
}

function escape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCsvFilename(metadata: SbomMetadata, now = new Date()): string {
  const date = formatIsoDate(now);
  const name = metadata.projectName
    ? slug(metadata.projectName)
    : 'blitsbom-export';
  return `${name}-${date}.csv`;
}

function formatIsoDate(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'blitsbom-export';
}

export function downloadCsv(
  components: readonly Component[],
  metadata: SbomMetadata,
): void {
  const csv = buildCsv(components);
  const filename = buildCsvFilename(metadata);
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
