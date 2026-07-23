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
