/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { describe, expect, it } from 'vitest';
import { formatSpecLabel, isUnverifiedCdxMinor } from './specLabel';
import { CDX_HIGHEST_VERIFIED_MINOR } from '../types';

const cdx = (specVersion: string) =>
  ({ sbomFormat: 'CycloneDX-1.x', specVersion }) as const;
const spdx = (specVersion: string) =>
  ({ sbomFormat: 'SPDX-2.x', specVersion }) as const;

describe('isUnverifiedCdxMinor', () => {
  it('is false at and below the verified ceiling', () => {
    for (let m = 4; m <= CDX_HIGHEST_VERIFIED_MINOR; m++) {
      expect(isUnverifiedCdxMinor(cdx(`1.${m}`))).toBe(false);
    }
  });

  it('is true above the verified ceiling', () => {
    expect(isUnverifiedCdxMinor(cdx(`1.${CDX_HIGHEST_VERIFIED_MINOR + 1}`))).toBe(
      true,
    );
    expect(isUnverifiedCdxMinor(cdx('1.99'))).toBe(true);
  });

  it('compares numerically, so 1.10 is above 1.7 not below it', () => {
    expect(isUnverifiedCdxMinor(cdx('1.10'))).toBe(true);
  });

  it('never fires for SPDX', () => {
    expect(isUnverifiedCdxMinor(spdx('SPDX-2.3'))).toBe(false);
    expect(isUnverifiedCdxMinor(spdx('SPDX-2.9'))).toBe(false);
  });

  it('is false for malformed versions rather than throwing', () => {
    for (const v of ['', '1', '1.x', 'v1.9', '1.9.0']) {
      expect(isUnverifiedCdxMinor(cdx(v))).toBe(false);
    }
  });
});

describe('formatSpecLabel', () => {
  it('labels a verified CycloneDX minor plainly', () => {
    expect(formatSpecLabel(cdx('1.7'))).toBe('CycloneDX 1.7');
  });

  it('flags a minor newer than this build', () => {
    expect(formatSpecLabel(cdx('1.9'))).toBe(
      'CycloneDX 1.9 (newer than this build)',
    );
  });

  it('passes SPDX through unchanged', () => {
    expect(formatSpecLabel(spdx('SPDX-2.3'))).toBe('SPDX-2.3');
  });
});
