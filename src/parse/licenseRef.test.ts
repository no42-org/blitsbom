import { describe, expect, it } from 'vitest';
import { resolveLicenseRef } from './licenseRef';

describe('resolveLicenseRef — name with ;link= suffix', () => {
  it('recognizes unquoted "BSD-3-Clause;link=URL" as BSD-3-Clause and lifts the URL', () => {
    const result = resolveLicenseRef({
      licenseId: 'LicenseRef-cbe57001c861adfae59886f1b9d5cb5a1d7872e',
      name: 'BSD-3-Clause;link=https://asm.ow2.io/LICENSE.txt',
    });
    expect(result).toEqual({
      kind: 'id',
      value: 'BSD-3-Clause',
      url: 'https://asm.ow2.io/LICENSE.txt',
    });
  });

  it('recognizes quoted "Apache-2.0";link="..." as Apache-2.0', () => {
    const result = resolveLicenseRef({
      licenseId: 'LicenseRef-abc',
      name: '"Apache-2.0";link="https://www.apache.org/licenses/LICENSE-2.0"',
    });
    expect(result).toEqual({
      kind: 'id',
      value: 'Apache-2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
    });
  });

  it('falls back to a name-kind license but still lifts the URL when id is unrecognized', () => {
    const result = resolveLicenseRef({
      licenseId: 'LicenseRef-xyz',
      name: 'TotallyMadeUp-1.0;link=https://example.org/LICENSE',
    });
    expect(result).toEqual({
      kind: 'name',
      value: 'TotallyMadeUp-1.0',
      url: 'https://example.org/LICENSE',
    });
  });
});
