/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { describe, expect, it } from 'vitest';
import { parseSbomText } from './load';

// Focused coverage for the metadata fields the report artifact depends on:
// product version and the identity of the generating tool, across the two
// `metadata.tools` shapes in the supported CycloneDX range.

function cdx(metadata: Record<string, unknown>): string {
  return JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    metadata,
    components: [{ type: 'library', name: 'foo', version: '1.0.0' }],
  });
}

describe('CycloneDX metadata extraction', () => {
  it('reads the product version from metadata.component.version', () => {
    const result = parseSbomText(
      cdx({ component: { name: 'acme-platform', version: '2.4.1' } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.projectName).toBe('acme-platform');
    expect(result.sbom.metadata.productVersion).toBe('2.4.1');
  });

  it('leaves product version null when the component has no version', () => {
    const result = parseSbomText(cdx({ component: { name: 'acme-platform' } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.productVersion).toBeNull();
  });

  it('reads the tool from the legacy 1.4 array form', () => {
    const result = parseSbomText(
      cdx({ tools: [{ vendor: 'anchore', name: 'syft', version: '1.18.1' }] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomTool).toBe('anchore syft 1.18.1');
  });

  it('reads the tool from the 1.5+ tools.components object form', () => {
    const result = parseSbomText(
      cdx({ tools: { components: [{ name: 'cdxgen', version: '10.0.0' }] } }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomTool).toBe('cdxgen 10.0.0');
  });

  it('leaves sbomTool null when tools is absent', () => {
    const result = parseSbomText(cdx({ component: { name: 'x' } }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomTool).toBeNull();
  });

  it('ignores a malformed tools entry with no name', () => {
    const result = parseSbomText(cdx({ tools: [{ version: '1.0.0' }] }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.sbom.metadata.sbomTool).toBeNull();
  });
});

// Originator fallback chain (#144): publisher → supplier.name →
// manufacturer.name → authors[0].name | author. Tested through the public
// parse path so the guard behavior on malformed shapes is exercised too.

function cdxWith(component: Record<string, unknown>): string {
  return JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    components: [{ type: 'library', name: 'foo', ...component }],
  });
}

function originatorOf(component: Record<string, unknown>): string | null {
  const result = parseSbomText(cdxWith(component));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('parse failed');
  return result.sbom.components[0]!.originator;
}

describe('CycloneDX originator fallback', () => {
  it('uses publisher when present (unchanged behavior)', () => {
    expect(
      originatorOf({ publisher: 'Acme', supplier: { name: 'Other' } }),
    ).toBe('Acme');
  });

  it('falls back past a NOASSERTION publisher to a real supplier', () => {
    expect(
      originatorOf({ publisher: 'NOASSERTION', supplier: { name: 'Acme' } }),
    ).toBe('Acme');
  });

  it('falls back past a whitespace-only publisher', () => {
    expect(
      originatorOf({ publisher: '  ', supplier: { name: 'Acme' } }),
    ).toBe('Acme');
  });

  it('uses supplier.name when only supplier is declared', () => {
    expect(originatorOf({ supplier: { name: 'Red Hat, Inc.' } })).toBe(
      'Red Hat, Inc.',
    );
  });

  it('uses manufacturer.name when only manufacturer is declared (1.6)', () => {
    expect(originatorOf({ manufacturer: { name: 'Example Corp' } })).toBe(
      'Example Corp',
    );
  });

  it('uses the first authors entry (1.6)', () => {
    expect(
      originatorOf({
        authors: [{ name: 'Alice Doe', email: 'a@e.com' }, { name: 'Bob' }],
      }),
    ).toBe('Alice Doe');
  });

  it('strips npm-style contact suffixes from the legacy author string', () => {
    expect(
      originatorOf({ author: 'Alice Doe <alice@example.com> (https://a.dev)' }),
    ).toBe('Alice Doe');
  });

  it('prefers the authors array over the deprecated author string', () => {
    expect(
      originatorOf({ authors: [{ name: 'Array Wins' }], author: 'Legacy' }),
    ).toBe('Array Wins');
  });

  it('returns null when no field answers', () => {
    expect(originatorOf({})).toBeNull();
  });

  it('skips malformed shapes without throwing', () => {
    expect(
      originatorOf({ supplier: 'not-an-object', authors: [null], author: 42 }),
    ).toBeNull();
  });

  it('publisher wins when every tier is present', () => {
    expect(
      originatorOf({
        publisher: 'Publisher',
        supplier: { name: 'Supplier' },
        manufacturer: { name: 'Manufacturer' },
        authors: [{ name: 'Author' }],
      }),
    ).toBe('Publisher');
  });
});
