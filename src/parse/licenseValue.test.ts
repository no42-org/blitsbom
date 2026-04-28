import { describe, expect, it } from 'vitest';
import { normalizeLicenseValue } from './licenseValue';

describe('normalizeLicenseValue', () => {
  it('passes a clean SPDX id through unchanged', () => {
    expect(normalizeLicenseValue('Apache-2.0')).toEqual({
      value: 'Apache-2.0',
      url: null,
    });
  });

  it('strips ";link=URL" and lifts the URL', () => {
    expect(
      normalizeLicenseValue(
        'BSD-3-Clause;link=https://asm.ow2.io/LICENSE.txt',
      ),
    ).toEqual({
      value: 'BSD-3-Clause',
      url: 'https://asm.ow2.io/LICENSE.txt',
    });
  });

  it('strips ";link=URL" with quoted URL', () => {
    expect(
      normalizeLicenseValue(
        'GPLv3+;link="https://www.gnu.org/licenses/gpl-3.0"',
      ),
    ).toEqual({
      value: 'GPLv3+',
      url: 'https://www.gnu.org/licenses/gpl-3.0',
    });
  });

  it('handles ;link= with no URL after it', () => {
    expect(normalizeLicenseValue('Apache-2.0;link=')).toEqual({
      value: 'Apache-2.0',
      url: null,
    });
  });

  it('strips surrounding double quotes', () => {
    expect(normalizeLicenseValue('"MIT"')).toEqual({
      value: 'MIT',
      url: null,
    });
  });

  it('strips surrounding single quotes', () => {
    expect(normalizeLicenseValue("'MIT'")).toEqual({
      value: 'MIT',
      url: null,
    });
  });

  it('combines ;link= stripping with surrounding quotes', () => {
    expect(
      normalizeLicenseValue('"Apache-2.0";link=https://example.org/LICENSE'),
    ).toEqual({
      value: 'Apache-2.0',
      url: 'https://example.org/LICENSE',
    });
  });

  it('strips "with <exception>" suffix on a single-token id', () => {
    expect(normalizeLicenseValue('GPLv2+ with classpath')).toEqual({
      value: 'GPLv2+',
      url: null,
    });
  });

  it('does not truncate prose names that happen to contain " with "', () => {
    expect(
      normalizeLicenseValue('Apache License Version 2.0 with notice'),
    ).toEqual({
      value: 'Apache License Version 2.0 with notice',
      url: null,
    });
  });

  it('returns an empty value for empty input', () => {
    expect(normalizeLicenseValue('')).toEqual({ value: '', url: null });
  });

  it('trims whitespace around the value', () => {
    expect(normalizeLicenseValue('  MIT  ')).toEqual({
      value: 'MIT',
      url: null,
    });
  });
});
