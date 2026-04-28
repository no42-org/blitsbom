import { describe, expect, it } from 'vitest';
import { classifyLicense, classifyComponent, CATEGORY_METADATA } from './classify';

describe('classifyLicense', () => {
  it('classifies Apache-2.0 as permissive', () => {
    expect(classifyLicense({ kind: 'id', value: 'Apache-2.0' })).toBe('permissive');
  });

  it('classifies MIT, BSD-*, ISC, Zlib as permissive', () => {
    for (const id of ['MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'Zlib', 'BSL-1.0']) {
      expect(classifyLicense({ kind: 'id', value: id })).toBe('permissive');
    }
  });

  it('classifies LGPL-* and MPL-2.0 as copyleft', () => {
    for (const id of ['LGPL-2.1', 'LGPL-3.0', 'MPL-2.0', 'EPL-2.0', 'CDDL-1.0']) {
      expect(classifyLicense({ kind: 'id', value: id })).toBe('copyleft');
    }
  });

  it('classifies GPL-* and AGPL-* as strong-copyleft', () => {
    for (const id of ['GPL-2.0', 'GPL-3.0', 'AGPL-3.0', 'GPL-3.0-or-later']) {
      expect(classifyLicense({ kind: 'id', value: id })).toBe('strong-copyleft');
    }
  });

  it('classifies CC0-1.0, Unlicense, WTFPL as public-domain', () => {
    for (const id of ['CC0-1.0', 'Unlicense', 'WTFPL']) {
      expect(classifyLicense({ kind: 'id', value: id })).toBe('public-domain');
    }
  });

  it('classifies NOASSERTION as undeclared', () => {
    expect(classifyLicense({ kind: 'id', value: 'NOASSERTION' })).toBe('undeclared');
  });

  it('classifies null/undefined as undeclared', () => {
    expect(classifyLicense(null)).toBe('undeclared');
    expect(classifyLicense(undefined)).toBe('undeclared');
  });

  it('falls back to proprietary for unknown ids', () => {
    expect(classifyLicense({ kind: 'id', value: 'TotallyMadeUp-1.0' })).toBe('proprietary');
  });

  it('classifies kind=name as proprietary', () => {
    expect(classifyLicense({ kind: 'name', value: 'Some custom EULA' })).toBe('proprietary');
  });

  it('classifies kind=expression as proprietary', () => {
    expect(classifyLicense({ kind: 'expression', value: '(MIT OR Apache-2.0)' })).toBe('proprietary');
  });
});

describe('classifyComponent', () => {
  it('classifies a component without licenses as undeclared', () => {
    expect(classifyComponent([])).toBe('undeclared');
  });

  it('classifies a multi-license component by its first license', () => {
    expect(
      classifyComponent([
        { kind: 'id', value: 'Apache-2.0' },
        { kind: 'id', value: 'GPL-2.0' },
      ]),
    ).toBe('permissive');
  });
});

describe('CATEGORY_METADATA', () => {
  it('contains all six categories in stable order', () => {
    const ids = CATEGORY_METADATA.map((c) => c.id);
    expect(ids).toEqual([
      'permissive',
      'public-domain',
      'copyleft',
      'strong-copyleft',
      'proprietary',
      'undeclared',
    ]);
  });

  it('exposes a colorToken for each category', () => {
    for (const c of CATEGORY_METADATA) {
      expect(c.colorToken).toMatch(/^color-license-/);
    }
  });
});
