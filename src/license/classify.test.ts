/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'vitest';
import {
  classifyLicense,
  classifyComponent,
  CATEGORY_METADATA,
} from './classify';

describe('classifyLicense — direct SPDX ids', () => {
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

  it('classifies CC-BY-4.0 and BlueOak-1.0.0 as permissive', () => {
    for (const id of ['CC-BY-4.0', 'BlueOak-1.0.0']) {
      expect(classifyLicense({ kind: 'id', value: id })).toBe('permissive');
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
});

describe('classifyLicense — name aliases', () => {
  it('recognizes GPLv2+, GPLv3+ as strong-copyleft', () => {
    expect(classifyLicense({ kind: 'name', value: 'GPLv2+' })).toBe('strong-copyleft');
    expect(classifyLicense({ kind: 'name', value: 'GPLv3+' })).toBe('strong-copyleft');
    expect(classifyLicense({ kind: 'name', value: 'GPLv2' })).toBe('strong-copyleft');
  });

  it('recognizes LGPLv2+, LGPLv3+ as copyleft', () => {
    expect(classifyLicense({ kind: 'name', value: 'LGPLv2+' })).toBe('copyleft');
    expect(classifyLicense({ kind: 'name', value: 'LGPLv3+' })).toBe('copyleft');
    expect(classifyLicense({ kind: 'name', value: 'LGPLv2.1' })).toBe('copyleft');
  });

  it('recognizes "ASL 2.0" and "Apache License Version 2.0" as permissive', () => {
    expect(classifyLicense({ kind: 'name', value: 'ASL 2.0' })).toBe('permissive');
    expect(classifyLicense({ kind: 'name', value: 'Apache License Version 2.0' })).toBe('permissive');
    expect(classifyLicense({ kind: 'name', value: 'Apache-2' })).toBe('permissive');
  });

  it('recognizes bare "BSD" as permissive (defaulting to BSD-3-Clause)', () => {
    expect(classifyLicense({ kind: 'name', value: 'BSD' })).toBe('permissive');
  });

  it('recognizes MPLv2.0 as copyleft', () => {
    expect(classifyLicense({ kind: 'name', value: 'MPLv2.0' })).toBe('copyleft');
  });

  it('recognizes "Public Domain" as public-domain', () => {
    expect(classifyLicense({ kind: 'name', value: 'Public Domain' })).toBe('public-domain');
  });

  it('recognizes "Python" as permissive (Python-2.0)', () => {
    expect(classifyLicense({ kind: 'name', value: 'Python' })).toBe('permissive');
  });

  it('strips OpenNMS-style ";link=…" suffix before lookup', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'BSD-3-Clause;link="https://opensource.org/licenses/BSD-3-Clause"',
      }),
    ).toBe('permissive');
    expect(
      classifyLicense({
        kind: 'name',
        value: 'GPLv3+;link=https://www.gnu.org/licenses/gpl-3.0',
      }),
    ).toBe('strong-copyleft');
  });

  it('strips "with <exception>" suffix', () => {
    expect(
      classifyLicense({ kind: 'name', value: 'GPLv2+ with autoconf exception' }),
    ).toBe('strong-copyleft');
  });

  it('classifies GPL with the Classpath exception as copyleft (#261)', () => {
    for (const value of [
      'GPLv2+ with classpath',
      'GPL-2.0-only WITH Classpath-exception-2.0',
      'GNU General Public License (GPL), version 2, with the Classpath exception',
      'LicenseRef-GPL2-w--CPE',
    ]) {
      expect(classifyLicense({ kind: 'name', value }), value).toBe('copyleft');
    }
    expect(
      classifyLicense({
        kind: 'expression',
        value: 'GPL-2.0-only WITH Classpath-exception-2.0',
      }),
    ).toBe('copyleft');
  });

  it('maps the Eclipse Distribution License to BSD-3-Clause (#261)', () => {
    for (const value of [
      'EDL-1.0',
      'LicenseRef-EDL-1.0',
      'Eclipse Distribution License - v 1.0',
      'LicenseRef-Eclipse-Distribution-License---v-1.0',
    ]) {
      expect(classifyLicense({ kind: 'name', value }), value).toBe('permissive');
    }
  });

  it('unwraps syft-slugged LicenseRef names (#261)', () => {
    expect(
      classifyLicense({
        kind: 'expression',
        value:
          'LicenseRef-Eclipse-Distribution-License---v-1.0 AND LicenseRef-Eclipse-Public-License---v-2.0',
      }),
    ).toBe('copyleft');
    expect(
      classifyLicense({
        kind: 'expression',
        value: 'LicenseRef-EDL-1.0 AND LicenseRef-EPL-2.0 AND LicenseRef-GPL2-w--CPE',
      }),
    ).toBe('copyleft');
  });
});

describe('classifyLicense — URLs', () => {
  it('recognizes apache.org URL as permissive', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'http://www.apache.org/licenses/LICENSE-2.0.txt',
      }),
    ).toBe('permissive');
  });

  it('recognizes gnu.org/licenses/lgpl as copyleft', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'https://www.gnu.org/licenses/lgpl-2.1.html',
      }),
    ).toBe('copyleft');
  });

  it('recognizes eclipse.org/legal/epl-2.0 as copyleft', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'http://www.eclipse.org/legal/epl-2.0',
      }),
    ).toBe('copyleft');
  });

  it('recognizes glassfish CDDL URLs as copyleft', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'https://glassfish.dev.java.net/public/CDDLv1.0.html',
      }),
    ).toBe('copyleft');
  });

  it('recognizes the current opensource.org/license/<id> URL form (#261)', () => {
    expect(
      classifyLicense({ kind: 'name', value: 'https://opensource.org/license/mit' }),
    ).toBe('permissive');
    expect(
      classifyLicense({ kind: 'name', value: 'https://opensource.org/license/bsd-3-clause' }),
    ).toBe('permissive');
    expect(
      classifyLicense({ kind: 'name', value: 'https://evil.com/opensource.org/license/mit' }),
    ).toBe('unrecognized');
  });

  it('falls back to the url field when the value is unrecognized (#261)', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'Some vendor name for EDL',
        url: 'http://www.eclipse.org/org/documents/edl-v10.php',
      }),
    ).toBe('permissive');
  });

  it('does not let the url override a recognized value', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'GPL-3.0',
        url: 'https://opensource.org/licenses/MIT',
      }),
    ).toBe('strong-copyleft');
  });

  it('does not mis-classify an embedded canonical host as the host itself', () => {
    // CodeQL js/regex/missing-regexp-anchor: an unanchored URL pattern would
    // classify `evil.com/apache.org/licenses/LICENSE-2.0` as Apache-2.0
    // (permissive). The host must sit at a real scheme/host boundary.
    expect(
      classifyLicense({
        kind: 'name',
        value: 'https://evil.com/apache.org/licenses/LICENSE-2.0',
      }),
    ).toBe('unrecognized');
    expect(
      classifyLicense({
        kind: 'name',
        value: 'https://evilapache.org/licenses/LICENSE-2.0',
      }),
    ).toBe('unrecognized');
  });
});

describe('classifyLicense — compound expressions', () => {
  it('AND takes the most restrictive sub-category', () => {
    expect(
      classifyLicense({ kind: 'expression', value: 'Apache-2.0 AND LGPL-2.1' }),
    ).toBe('copyleft');
    expect(
      classifyLicense({ kind: 'expression', value: 'MIT AND GPL-2.0-or-later' }),
    ).toBe('strong-copyleft');
  });

  it('OR takes the least restrictive sub-category', () => {
    expect(
      classifyLicense({ kind: 'expression', value: 'MIT OR GPL-2.0' }),
    ).toBe('permissive');
    expect(
      classifyLicense({ kind: 'expression', value: 'LGPL-2.1 OR GPL-3.0' }),
    ).toBe('copyleft');
  });

  it('handles nested grouping via paren stripping', () => {
    expect(
      classifyLicense({
        kind: 'expression',
        value: '(MIT OR Apache-2.0) AND BSD-3-Clause',
      }),
    ).toBe('permissive');
    expect(
      classifyLicense({
        kind: 'expression',
        value: '(GPLv2+ or LGPLv3+) and GPLv3+',
      }),
    ).toBe('strong-copyleft');
  });

  it('classifies expressions with non-canonical names by alias lookup', () => {
    expect(
      classifyLicense({ kind: 'expression', value: 'BSD-3-Clause AND EPL-2.0' }),
    ).toBe('copyleft');
    expect(
      classifyLicense({ kind: 'expression', value: 'GPLv3+ and LGPLv2+' }),
    ).toBe('strong-copyleft');
  });
});

describe('classifyLicense — fallback to unrecognized', () => {
  it('classifies an unknown bare id as unrecognized', () => {
    expect(classifyLicense({ kind: 'id', value: 'TotallyMadeUp-1.0' })).toBe('unrecognized');
  });

  it('classifies an unknown free-form name as unrecognized', () => {
    expect(classifyLicense({ kind: 'name', value: 'Some custom EULA' })).toBe('unrecognized');
  });

  it('classifies unrecognizable expressions as unrecognized', () => {
    expect(
      classifyLicense({ kind: 'expression', value: '(Foo AND Bar)' }),
    ).toBe('unrecognized');
  });

  it('classifies a SHA-named LicenseRef-like name as unrecognized', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'LicenseRef-cbe57001c861adfae59886f1b9d5cb5a1d7872e',
      }),
    ).toBe('unrecognized');
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
  it('contains all seven categories in the fixed display order', () => {
    const ids = CATEGORY_METADATA.map((c) => c.id);
    expect(ids).toEqual([
      'public-domain',
      'permissive',
      'copyleft',
      'strong-copyleft',
      'proprietary',
      'unrecognized',
      'undeclared',
    ]);
  });

  it('exposes a colorToken for each category', () => {
    for (const c of CATEGORY_METADATA) {
      expect(c.colorToken).toMatch(/^color-license-/);
    }
  });
});
