import type { Component, SbomMetadata } from '../types';

export const CSV_COLUMNS = [
  'Name',
  'Version',
  'License',
  'Scope',
  'Type',
  'Group',
  'Publisher',
  'purl',
] as const;

const CRLF = '\r\n';

/**
 * Build an RFC 4180-compliant CSV string from a list of components.
 * Quotes fields containing commas, double quotes, or newlines.
 * Uses CRLF line endings as required by the RFC.
 */
export function buildCsv(components: readonly Component[]): string {
  const rows: string[] = [CSV_COLUMNS.map(escape).join(',')];
  for (const c of components) {
    rows.push(
      [
        c.name,
        c.version ?? '',
        c.licenses.map((l) => l.value).join('; '),
        c.scope ?? '',
        c.type,
        c.group ?? '',
        c.publisher ?? '',
        c.purl ?? '',
      ]
        .map(escape)
        .join(','),
    );
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
