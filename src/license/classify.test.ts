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
    expect(classifyLicense({ kind: 'name', value: 'https://glassfish.java.net' })).toBe(
      'copyleft',
    );
    // The pattern names a host, so a longer hostname must not match it.
    for (const value of [
      'https://glassfish.java.net.evil.com/CDDL',
      'https://glassfish.dev.java.net-evil.com/CDDL',
    ]) {
      expect(classifyLicense({ kind: 'name', value })).toBe('unrecognized');
    }
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
    // `//` alone is no boundary: it can appear later in another host's URL.
    for (const value of [
      'https://evil.com/?u=//apache.org/licenses/LICENSE-2.0',
      'https://evil.com/x//www.gnu.org/licenses/gpl',
      'evil.com//www.apache.org/licenses/LICENSE-2.0',
    ]) {
      expect(classifyLicense({ kind: 'name', value })).toBe('unrecognized');
    }
    // A URL wrapped in text, as freemarker declares it, still counts.
    for (const value of [
      'Apache License, Version 2.0; see: http://www.apache.org/licenses/LICENSE-2.0.txt',
      '//www.apache.org/licenses/LICENSE-2.0',
    ]) {
      expect(classifyLicense({ kind: 'name', value })).toBe('permissive');
    }
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

describe('classifyLicense — common URLs and names (#309)', () => {
  const cases: Array<[string, string]> = [
    ['http://www.opensource.org/licenses/bsd-license.php', 'permissive'],
    ['https://creativecommons.org/publicdomain/zero/1.0/', 'public-domain'],
    ['https://www.gnu.org/licenses/old-licenses/lgpl-2.1.html', 'copyleft'],
    ['https://www.gnu.org/licenses/old-licenses/lgpl-2.0.html', 'copyleft'],
    ['https://www.gnu.org/licenses/old-licenses/gpl-2.0.html', 'strong-copyleft'],
    ['https://oss.oracle.com/licenses/CDDL+GPL-1.1', 'copyleft'],
    ['http://repository.jboss.org/licenses/apache-2.0.txt', 'permissive'],
    ['https://repository.jboss.org/licenses/apache-2.0.txt', 'permissive'],
    ['CDDL 1.1', 'copyleft'],
    ['The BSD License', 'permissive'],
    ['Apache License 2.0', 'permissive'],
  ];
  for (const [value, category] of cases) {
    it(`classifies ${value} as ${category}`, () => {
      expect(classifyLicense({ kind: 'name', value })).toBe(category);
    });
  }

  it('classifies a new URL through the url fallback', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'CDDL+GPL License',
        url: 'https://oss.oracle.com/licenses/CDDL+GPL-1.1',
      }),
    ).toBe('copyleft');
  });

  it('leaves a project-specific URL unrecognized', () => {
    expect(
      classifyLicense({ kind: 'name', value: 'https://jsoup.org/license' }),
    ).toBe('unrecognized');
  });

  it('does not match a canonical host embedded in another path', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'https://evil.example/creativecommons.org/publicdomain/zero/1.0/',
      }),
    ).toBe('unrecognized');
  });
});

describe('classifyLicense — OSGi Bundle-License values (#308)', () => {
  const cases: Array<[string, string]> = [
    [
      'Apache-2.0;description="This program and the accompanying materials are made available under the terms of the Apache License, Version 2.0."',
      'permissive',
    ],
    [
      'Revised BSD;link="https://github.com/mwiede/jsch/blob/master/LICENSE.txt",Revised BSD;link="https://github.com/mwiede/jsch/blob/master/LICENSE.JZlib.txt",ISC',
      'permissive',
    ],
    [
      'https://www.eclipse.org/org/documents/epl-2.0/EPL-2.0.txt, https://www.gnu.org/software/classpath/license.html',
      'copyleft',
    ],
    [
      'https://projects.eclipse.org/license/epl-2.0, https://projects.eclipse.org/license/secondary-gpl-2.0-cp',
      'copyleft',
    ],
    [
      'http://repository.jboss.org/licenses/cddl.txt, http://repository.jboss.org/licenses/gpl-2.0-ce.txt',
      'copyleft',
    ],
    [
      'http://opensource.org/licenses/apache2.0.php; link="http://www.apache.org/licenses/LICENSE-2.0"; description="Apache License, Version 2.0"',
      'permissive',
    ],
    // The entries are alternatives, as for a Maven <licenses> list.
    ['MIT, GPL-3.0', 'permissive'],
    ['MIT, Some Vendor EULA', 'unrecognized'],
    // A URL pattern matches a substring, so the whole list must not be
    // looked up as one URL.
    [
      'https://www.gnu.org/licenses/gpl-3.0, https://www.eclipse.org/legal/epl-2.0',
      'copyleft',
    ],
    // Stripping the first entry's attributes must not swallow the rest.
    ['GPL-3.0;link="https://example.com/GPL", MIT', 'permissive'],
    ['Apache-2.0;bundle-license:=directive', 'permissive'],
  ];
  for (const [value, category] of cases) {
    it(`classifies ${value.slice(0, 60)} as ${category}`, () => {
      expect(classifyLicense({ kind: 'name', value })).toBe(category);
    });
  }

  // Lists that matched one URL as a substring before the split (#308).
  it('classifies URL lists from the OpenNMS images', () => {
    const lists: Array<[string, string]> = [
      [
        'http://www.apache.org/licenses/LICENSE-2.0, https://www.eclipse.org/org/documents/epl-v10.php',
        'permissive',
      ],
      [
        'http://www.mozilla.org/MPL/MPL-1.1.html, http://www.gnu.org/licenses/lgpl-2.1.html, https://www.apache.org/licenses/LICENSE-2.0',
        'permissive',
      ],
      [
        'https://www.eclipse.org/legal/epl-2.0/, http://www.gnu.org/copyleft/gpl.html, http://www.gnu.org/licenses/lgpl.html',
        'copyleft',
      ],
    ];
    for (const [value, category] of lists) {
      expect(classifyLicense({ kind: 'name', value })).toBe(category);
    }
  });

  it('classifies an unsplittable value whole, url fallback included', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'MIT, Some Vendor EULA',
        url: 'https://opensource.org/licenses/MIT',
      }),
    ).toBe('permissive');
  });

  it('falls back to the url when a comma splits a name into fragments', () => {
    expect(
      classifyLicense({
        kind: 'name',
        value: 'GNU Lesser/Library Public License, Version 3.0',
        url: 'http://www.gnu.org/licenses/lgpl-3.0.txt',
      }),
    ).toBe('copyleft');
  });

  it('does not split a name that contains a comma', () => {
    for (const value of [
      'Apache License, Version 2.0',
      'The Apache Software License, Version 2.0',
      'Apache License, Version 2.0;link="https://www.apache.org/licenses/LICENSE-2.0"',
      // An unquoted attribute value with a comma leaves a fragment.
      'MIT;link=https://example.com/lic?a,b',
    ]) {
      expect(classifyLicense({ kind: 'name', value })).toBe('permissive');
    }
  });
});

describe('classifyLicense — ScanCode LicenseDB ids (#307)', () => {
  const expr = (value: string) =>
    classifyLicense({ kind: 'expression', value });

  it('classifies SPDX ids from RHEL RPM expressions', () => {
    expect(expr('MIT AND X11')).toBe('permissive');
    expect(expr('GPL-3.0-or-later AND GFDL-1.3-only')).toBe('strong-copyleft');
    expect(classifyLicense({ kind: 'id', value: 'OFL-1.1' })).toBe('copyleft');
    expect(classifyLicense({ kind: 'id', value: 'curl' })).toBe('permissive');
  });

  it('classifies the Fedora public-domain refs', () => {
    expect(expr('MIT AND LicenseRef-Fedora-Public-Domain')).toBe('permissive');
    for (const value of [
      'LicenseRef-Fedora-Public-Domain',
      'LicenseRef-Not-Copyrightable',
    ]) {
      expect(classifyLicense({ kind: 'name', value })).toBe('public-domain');
    }
  });

  it('leaves non-SPDX tokens unrecognized', () => {
    for (const value of ['sprintf', 'CC-BY']) {
      expect(classifyLicense({ kind: 'name', value })).toBe('unrecognized');
    }
  });

  it('matches SPDX ids case-insensitively', () => {
    expect(expr('gpl-2.0-or-later AND mit AND bsd-3-clause')).toBe(
      'strong-copyleft',
    );
    expect(expr('licenseref-fedora-public-domain')).toBe('public-domain');
  });

  it('does not classify ScanCode aliases that are not SPDX ids', () => {
    // "GPL 2.0" must not leave junk keys behind; LicenseRef-LICENSE is a
    // placeholder, not a proprietary license.
    for (const value of ['2.0', '2.0+', 'LicenseRef-LICENSE', 'LicenseRef-Commercial']) {
      expect(classifyLicense({ kind: 'name', value })).toBe('unrecognized');
    }
  });

  it('pins the ESA-PL copyleft variants ScanCode lists as permissive', () => {
    expect(classifyLicense({ kind: 'id', value: 'ESA-PL-strong-copyleft-2.4' })).toBe(
      'strong-copyleft',
    );
    expect(classifyLicense({ kind: 'id', value: 'ESA-PL-weak-copyleft-2.4' })).toBe(
      'copyleft',
    );
  });

  it('pins the HPND export-notice variants ScanCode lists as Free Restricted (#316)', () => {
    for (const value of [
      'HPND-export-US',
      'HPND-export-US-acknowledgement',
      'HPND-UC-export-US',
    ]) {
      expect(classifyLicense({ kind: 'id', value })).toBe('permissive');
    }
  });

  it('classifies krb5-libs from RHEL 10.2 as permissive (#316)', () => {
    expect(
      expr(
        'Brian-Gladman-2-Clause AND BSD-2-Clause AND (BSD-2-Clause OR GPL-2.0-or-later) AND BSD-2-Clause-first-lines AND BSD-3-Clause AND BSD-4-Clause AND CMU-Mach-nodoc AND FSFULLRWD AND HPND AND HPND-export2-US AND HPND-export-US AND HPND-export-US-acknowledgement AND HPND-export-US-modify AND ISC AND MIT AND MIT-CMU AND OLDAP-2.8 AND OpenVision',
      ),
    ).toBe('permissive');
  });

  it('keeps the other Free Restricted ids proprietary', () => {
    for (const value of ['BSD-3-Clause-No-Military-License', 'Hippocratic-2.1']) {
      expect(classifyLicense({ kind: 'id', value })).toBe('proprietary');
    }
  });

  it('unwraps LicenseRef-<id> for ScanCode and lowercase ids', () => {
    expect(classifyLicense({ kind: 'name', value: 'LicenseRef-X11' })).toBe('permissive');
    expect(classifyLicense({ kind: 'name', value: 'LicenseRef-mit' })).toBe('permissive');
  });

  it('keeps the FSF placement where ScanCode disagrees', () => {
    // ScanCode: 0BSD permissive, Artistic-2.0 copyleft.
    expect(classifyLicense({ kind: 'id', value: '0BSD' })).toBe('public-domain');
    expect(classifyLicense({ kind: 'id', value: 'Artistic-2.0' })).toBe(
      'permissive',
    );
    expect(classifyLicense({ kind: 'id', value: 'artistic-2.0' })).toBe(
      'permissive',
    );
  });
});

describe('classifyLicense — spelling variants and OSI URLs (#321)', () => {
  const cases: Array<[string, string]> = [
    ['The GNU Lesser General Public License', 'copyleft'],
    ['BSD licence', 'permissive'],
    ['The Apache Software Licence, Version 2.0', 'permissive'],
    ['https://www.opensource.org/licenses/LGPL-2.1', 'copyleft'],
    ['https://opensource.org/license/EPL-2.0', 'copyleft'],
    ['https://opensource.org/licenses/GPL-3.0', 'strong-copyleft'],
    ['https://opensource.org/licenses/not-a-license', 'unrecognized'],
    ['https://evil.example/opensource.org/licenses/LGPL-2.1', 'unrecognized'],
  ];
  for (const [value, category] of cases) {
    it(`classifies ${value} as ${category}`, () => {
      expect(classifyLicense({ kind: 'name', value })).toBe(category);
    });
  }

  it('classifies an OSI url naming any known SPDX id through the url fallback', () => {
    expect(
      classifyLicense({ kind: 'name', value: 'x', url: 'https://www.opensource.org/licenses/LGPL-2.1' }),
    ).toBe('copyleft');
    expect(
      classifyLicense({
        kind: 'name',
        value: 'GNU Library General Public License v2.1 or later',
        url: 'https://www.opensource.org/licenses/LGPL-2.1',
      }),
    ).toBe('copyleft');
  });
});
