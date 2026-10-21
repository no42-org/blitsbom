/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

import { describe, expect, it } from 'vitest';
import { inheritTwinLicenses } from './licenseInherit';
import { canonicalizePurl } from './purlMatch';
import { classifyComponent } from '../license/classify';
import type { Component, License } from '../types';

function comp(purl: string | null, licenses: License[] = []): Component {
  return {
    type: 'library',
    group: null,
    name: 'lib',
    version: null,
    description: null,
    publisher: null,
    originator: null,
    scope: null,
    purl,
    purlCanonical: canonicalizePurl(purl),
    bomRef: null,
    licenses,
    vulnerabilities: [],
  };
}

const AGPL: License = { kind: 'name', value: 'http://www.gnu.org/licenses/agpl.html' };
const MIT: License = { kind: 'id', value: 'MIT' };
const GPL: License = { kind: 'id', value: 'GPL-3.0' };

describe('inheritTwinLicenses (#323)', () => {
  it('inherits the license of a twin with the same purl', () => {
    const purl = 'pkg:maven/org.opennms.core/org.opennms.core.xml@36.0.4';
    const nested = comp(purl);
    inheritTwinLicenses([nested, comp(purl, [AGPL])]);
    expect(nested.licenses).toEqual([AGPL]);
    expect(nested.licensesInherited).toBe(true);
    expect(classifyComponent(nested.licenses)).toBe('strong-copyleft');
  });

  it('ignores qualifiers and subpath', () => {
    const nested = comp('pkg:maven/org.example/lib@1.0?type=jar#sub/path');
    inheritTwinLicenses([nested, comp('pkg:maven/org.example/lib@1.0', [MIT])]);
    expect(classifyComponent(nested.licenses)).toBe('permissive');
  });

  it('stays undeclared when twins disagree on the category', () => {
    const purl = 'pkg:maven/org.example/lib@1.0';
    const nested = comp(purl);
    inheritTwinLicenses([comp(purl, [MIT]), comp(purl, [GPL]), nested]);
    expect(nested.licenses).toEqual([]);
    expect(nested.licensesInherited).toBeUndefined();
  });

  it('inherits when twins agree on the category but not the value', () => {
    const purl = 'pkg:maven/org.example/lib@1.0';
    const nested = comp(purl);
    const apache: License = { kind: 'id', value: 'Apache-2.0' };
    inheritTwinLicenses([nested, comp(purl, [MIT]), comp(purl, [apache])]);
    expect(nested.licenses).toEqual([MIT]);
  });

  it('does not inherit across versions', () => {
    const nested = comp('pkg:maven/org.example/lib@1.0');
    inheritTwinLicenses([nested, comp('pkg:maven/org.example/lib@2.0', [MIT])]);
    expect(classifyComponent(nested.licenses)).toBe('undeclared');
  });

  it('does not inherit without a purl version', () => {
    const nested = comp('pkg:maven/org.example/lib');
    inheritTwinLicenses([nested, comp('pkg:maven/org.example/lib', [MIT])]);
    expect(classifyComponent(nested.licenses)).toBe('undeclared');
  });

  it('treats a NOASSERTION license as no license', () => {
    const purl = 'pkg:maven/org.example/lib@1.0';
    const nested = comp(purl, [{ kind: 'id', value: 'NOASSERTION' }]);
    inheritTwinLicenses([nested, comp(purl, [MIT])]);
    expect(nested.licenses).toEqual([MIT]);
  });

  it('keeps a declared license that follows NOASSERTION', () => {
    const purl = 'pkg:maven/org.example/lib@1.0';
    const own: License[] = [{ kind: 'id', value: 'NOASSERTION' }, GPL];
    const c = comp(purl, own);
    inheritTwinLicenses([c, comp(purl, [MIT])]);
    expect(c.licenses).toEqual(own);
    expect(c.licensesInherited).toBeUndefined();
  });

  it('does not inherit into a file component', () => {
    const purl = 'pkg:maven/org.example/lib@1.0';
    const file = { ...comp(purl), type: 'file' };
    inheritTwinLicenses([file, comp(purl, [MIT])]);
    expect(file.licenses).toEqual([]);
  });

  it('leaves licensed components and components without a purl alone', () => {
    const purl = 'pkg:maven/org.example/lib@1.0';
    const licensed = comp(purl, [GPL]);
    const noPurl = comp(null);
    inheritTwinLicenses([licensed, noPurl, comp(purl, [GPL])]);
    expect(licensed.licensesInherited).toBeUndefined();
    expect(noPurl.licenses).toEqual([]);
  });
});
