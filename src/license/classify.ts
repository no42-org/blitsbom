/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

// SPDX-id → license category lookup.
//
// AUTHORITY: Free Software Foundation license list at
//   https://www.gnu.org/licenses/license-list.html
//
// Each entry's category is justified by the FSF's classification at the URL
// above. Disputes about a placement should be raised by linking the FSF page
// for that license. One exception: BlueOak-1.0.0 is absent from the FSF list,
// so its placement follows its OSI approval instead. The taxonomy here intentionally compresses several FSF
// distinctions into six buckets — Permissive vs. Copyleft is the most useful
// split for a viewer audience that includes legal/procurement, not just
// engineers.
//
// SECOND AUTHORITY: ScanCode LicenseDB at
//   https://scancode-licensedb.aboutcode.org/
// The FSF does not classify most of the SPDX License List (X11, HPND, curl,
// the GFDL family, ...). For an SPDX id that TABLE does not hold, the
// category comes from ScanCode, via the generated ./scancode.ts. A TABLE
// entry always wins. (#307)
//
// Beyond the canonical SPDX-id lookup (TABLE), this module also handles the
// messy real-world inputs found in CycloneDX and SPDX SBOMs:
//   - free-form name aliases (GPLv2+, ASL 2.0, "Apache License Version 2.0")
//   - URL-as-license-value (gnu.org/licenses/lgpl, eclipse.org/legal/epl-…)
//   - compound expressions (Apache-2.0 AND LGPL-2.1, MIT OR GPL-2.0)
//   - OpenNMS-tooling artifacts ("BSD-3-Clause;link=https://…")

import type { License, LicenseCategory } from '../types';
import { SCANCODE_IDS } from './scancode';

interface CategoryMeta {
  id: LicenseCategory;
  label: string;
  /** CSS variable name (without leading --) declared in @theme static. */
  colorToken: string;
  /** Stable display order — left-to-right in legend, clockwise in donut. */
  order: number;
}

/**
 * Fixed display order. Used for both clockwise donut segment placement and
 * legend row ordering — the categories follow a logical openness-to-risk
 * progression rather than sorting by count.
 */
export const CATEGORY_METADATA: readonly CategoryMeta[] = [
  {
    id: 'public-domain',
    label: 'Public Domain',
    colorToken: 'color-license-public-domain',
    order: 1,
  },
  {
    id: 'permissive',
    label: 'Permissive',
    colorToken: 'color-license-permissive',
    order: 2,
  },
  {
    id: 'copyleft',
    label: 'Copyleft',
    colorToken: 'color-license-copyleft',
    order: 3,
  },
  {
    id: 'strong-copyleft',
    label: 'Strong Copyleft',
    colorToken: 'color-license-strong-copyleft',
    order: 4,
  },
  {
    id: 'proprietary',
    label: 'Proprietary',
    colorToken: 'color-license-proprietary',
    order: 5,
  },
  {
    id: 'unrecognized',
    label: 'Unrecognized',
    colorToken: 'color-license-unrecognized',
    order: 6,
  },
  {
    id: 'undeclared',
    label: 'Undeclared',
    colorToken: 'color-license-undeclared',
    order: 7,
  },
] as const;

const TABLE: Record<string, LicenseCategory> = {
  // Public domain — FSF lists these as "free, public domain compatible".
  'CC0-1.0': 'public-domain',
  Unlicense: 'public-domain',
  WTFPL: 'public-domain',
  '0BSD': 'public-domain',

  // Permissive — FSF "lax permissive free software licenses".
  'Apache-2.0': 'permissive',
  MIT: 'permissive',
  'MIT-0': 'permissive',
  'BSD-2-Clause': 'permissive',
  'BSD-3-Clause': 'permissive',
  'BSD-4-Clause': 'permissive', // FSF: incompatible with GPL but still free permissive
  ISC: 'permissive',
  Zlib: 'permissive',
  'BSL-1.0': 'permissive',
  PostgreSQL: 'permissive',
  'Artistic-2.0': 'permissive',
  'Python-2.0': 'permissive',
  'Apache-1.0': 'permissive',
  'Apache-1.1': 'permissive',
  // FSF: free, lax, one-way GPLv3-compatible; common on docs/data packages.
  'CC-BY-4.0': 'permissive',
  // Not on the FSF list — OSI-approved (2024) simple permissive license.
  'BlueOak-1.0.0': 'permissive',

  // Weak / file-scoped copyleft.
  'LGPL-2.0': 'copyleft',
  'LGPL-2.0-only': 'copyleft',
  'LGPL-2.0-or-later': 'copyleft',
  'LGPL-2.1': 'copyleft',
  'LGPL-2.1-only': 'copyleft',
  'LGPL-2.1-or-later': 'copyleft',
  'LGPL-3.0': 'copyleft',
  'LGPL-3.0-only': 'copyleft',
  'LGPL-3.0-or-later': 'copyleft',
  'MPL-2.0': 'copyleft',
  'MPL-1.1': 'copyleft',
  'EPL-1.0': 'copyleft',
  'EPL-2.0': 'copyleft',
  'CDDL-1.0': 'copyleft',
  'CDDL-1.1': 'copyleft',
  'EUPL-1.1': 'copyleft',
  'EUPL-1.2': 'copyleft',
  // Deprecated SPDX id, kept as the canonical key for any GPL carrying the
  // Classpath exception: linking code is not bound by the GPL. (#261)
  'GPL-2.0-with-classpath-exception': 'copyleft',

  // Strong / project-level copyleft.
  'GPL-2.0': 'strong-copyleft',
  'GPL-2.0-only': 'strong-copyleft',
  'GPL-2.0-or-later': 'strong-copyleft',
  'GPL-3.0': 'strong-copyleft',
  'GPL-3.0-only': 'strong-copyleft',
  'GPL-3.0-or-later': 'strong-copyleft',
  'AGPL-3.0': 'strong-copyleft',
  'AGPL-3.0-only': 'strong-copyleft',
  'AGPL-3.0-or-later': 'strong-copyleft',
};

// SPDX ids are case-insensitive, so both tables are looked up lowercased.
const TABLE_LC = new Map(
  Object.entries(TABLE).map(([id, cat]) => [id.toLowerCase(), cat]),
);
const SCANCODE = new Map<string, LicenseCategory>();
for (const [cat, ids] of Object.entries(SCANCODE_IDS)) {
  for (const id of ids.split(' ')) {
    SCANCODE.set(id.toLowerCase(), cat as LicenseCategory);
  }
}

/**
 * Severity ordering used for compound expression resolution.
 * `unrecognized` ranks just below `proprietary` — when an OR clause mixes a
 * known permissive license with an unrecognized one, OR-min picks the known
 * permissive option (user can take that). When AND combines a known license
 * with an unrecognized one, AND-max picks the unrecognized one (we don't
 * know, treat conservatively).
 */
const SEVERITY_RANK: Record<LicenseCategory, number> = {
  undeclared: 0,
  'public-domain': 1,
  permissive: 2,
  copyleft: 3,
  'strong-copyleft': 4,
  unrecognized: 5,
  proprietary: 6,
};

/**
 * Common shorthand / non-canonical license names mapped to their SPDX ids.
 * Sources: real-world SBOMs (notably the OpenNMS samples) and the FSF list.
 * Keys are matched case-insensitively after normalization.
 */
const NAME_ALIASES: Record<string, string> = {
  // Apache family
  'asl 2.0': 'Apache-2.0',
  'asl 1.1': 'Apache-1.1',
  'asl 1.0': 'Apache-1.0',
  'apache 2': 'Apache-2.0',
  'apache 2.0': 'Apache-2.0',
  'apache-2': 'Apache-2.0',
  'apache license': 'Apache-2.0',
  'apache license 2.0': 'Apache-2.0',
  'apache license v2.0': 'Apache-2.0',
  'apache license version 2.0': 'Apache-2.0',
  'apache license, version 2.0': 'Apache-2.0',
  'apache software license': 'Apache-2.0',
  'apache software license, version 2.0': 'Apache-2.0',
  'the apache software license, version 2.0': 'Apache-2.0',

  // GPL family
  gpl: 'GPL-3.0-or-later',
  'gpl+': 'GPL-3.0-or-later',
  gplv2: 'GPL-2.0',
  'gplv2+': 'GPL-2.0-or-later',
  gplv3: 'GPL-3.0',
  'gplv3+': 'GPL-3.0-or-later',
  agplv3: 'AGPL-3.0',
  'agplv3+': 'AGPL-3.0-or-later',
  'gpl2-w--cpe': 'GPL-2.0-with-classpath-exception', // syft LicenseRef slug

  // LGPL family
  lgpl: 'LGPL-3.0-or-later',
  lgplv2: 'LGPL-2.0',
  'lgplv2+': 'LGPL-2.0-or-later',
  'lgplv2.1': 'LGPL-2.1',
  'lgplv2.1+': 'LGPL-2.1-or-later',
  lgplv3: 'LGPL-3.0',
  'lgplv3+': 'LGPL-3.0-or-later',
  'gnu lesser general public license': 'LGPL-3.0-or-later',

  // MPL
  mplv2: 'MPL-2.0',
  'mplv2.0': 'MPL-2.0',
  'mpl 2.0': 'MPL-2.0',
  'mpl-2': 'MPL-2.0',
  'mpl 1.1': 'MPL-1.1',
  'mplv1.1': 'MPL-1.1',

  // BSD — bare "BSD" is ambiguous; default to 3-clause as the most common
  // interpretation. If someone needs 2-clause specificity they'll use the
  // SPDX id directly.
  bsd: 'BSD-3-Clause',
  'bsd license': 'BSD-3-Clause',
  'revised bsd': 'BSD-3-Clause',
  'the bsd license': 'BSD-3-Clause',

  // Eclipse
  'eclipse public license': 'EPL-2.0',
  'eclipse public license 2.0': 'EPL-2.0',
  'eclipse public license, version 2.0': 'EPL-2.0',
  'eclipse-public-license---v-2.0': 'EPL-2.0', // syft LicenseRef slug
  // EDL 1.0 is the BSD-3-Clause text under another name.
  'edl-1.0': 'BSD-3-Clause',
  'eclipse distribution license - v 1.0': 'BSD-3-Clause',
  'eclipse-distribution-license---v-1.0': 'BSD-3-Clause', // syft LicenseRef slug

  // CDDL
  cddl: 'CDDL-1.0',
  'cddl 1.0': 'CDDL-1.0',
  'cddl 1.1': 'CDDL-1.1',
  'common development and distribution license': 'CDDL-1.0',

  // Misc
  python: 'Python-2.0',
  'public domain': 'CC0-1.0',
  // Fedora's ref for content that has no copyright; not in ScanCode. (#307)
  'licenseref-not-copyrightable': 'CC0-1.0',
  'the mit license': 'MIT',
  'mit license': 'MIT',
};

/**
 * URL substring patterns mapped to the SPDX id they identify. Used when a
 * `kind: name` license value contains a URL. Order matters — more specific
 * patterns should appear before generic ones (e.g., gnu.org/licenses/lgpl-3.0
 * before gnu.org/licenses/lgpl).
 */
// Host-anchored patterns: each entry requires `//` (scheme separator) plus an
// optional subdomain chain before the canonical host. This blocks
// prefix-injection inputs like `evil.com/apache.org/licenses/LICENSE-2.0`
// from being mis-classified.
const URL_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\/\/(?:[a-z0-9-]+\.)*apache\.org\/licenses\/LICENSE-2\.0/i, 'Apache-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/MIT/i, 'MIT'],
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/BSD-3-Clause/i, 'BSD-3-Clause'],
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/BSD-2-Clause/i, 'BSD-2-Clause'],
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/ISC/i, 'ISC'],
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/Apache-2\.0/i, 'Apache-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/apache2\.0\.php/i, 'Apache-2.0'],
  // OSI's legacy page, which redirects to BSD-2-Clause.
  [/\/\/(?:[a-z0-9-]+\.)*opensource\.org\/licenses\/bsd-license\.php/i, 'BSD-2-Clause'],
  [/\/\/(?:[a-z0-9-]+\.)*creativecommons\.org\/publicdomain\/zero\/1\.0/i, 'CC0-1.0'],
  [/\/\/(?:[a-z0-9-]+\.)*repository\.jboss\.org\/licenses\/apache-2\.0/i, 'Apache-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*repository\.jboss\.org\/licenses\/cddl/i, 'CDDL-1.0'],
  // "ce" and "cp" both name the Classpath exception.
  [/\/\/(?:[a-z0-9-]+\.)*repository\.jboss\.org\/licenses\/gpl-2\.0-ce/i, 'GPL-2.0-with-classpath-exception'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/license\/secondary-gpl-2\.0-cp/i, 'GPL-2.0-with-classpath-exception'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/software\/classpath\/license/i, 'GPL-2.0-with-classpath-exception'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/agpl/i, 'AGPL-3.0-or-later'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/lgpl-3\.0/i, 'LGPL-3.0'],
  // GNU keeps the 2.x texts under old-licenses/. Only the versioned patterns
  // accept it: the bare gpl/lgpl catch-alls would map old-licenses/gpl-1.0
  // to GPL-3.0-or-later.
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/(?:old-licenses\/)?lgpl-2\.1/i, 'LGPL-2.1'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/(?:old-licenses\/)?lgpl-2\.0/i, 'LGPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/lgpl/i, 'LGPL-3.0-or-later'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/gpl-3\.0/i, 'GPL-3.0'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/(?:old-licenses\/)?gpl-2\.0/i, 'GPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/licenses\/gpl/i, 'GPL-3.0-or-later'],
  // gnu.org/copyleft/ pages describe the current GPL and LGPL.
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/copyleft\/lesser/i, 'LGPL-3.0-or-later'],
  [/\/\/(?:[a-z0-9-]+\.)*gnu\.org\/copyleft\/gpl/i, 'GPL-3.0-or-later'],
  [/\/\/(?:[a-z0-9-]+\.)*mozilla\.org\/MPL\/2\.0/i, 'MPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*mozilla\.org\/MPL\/1\.1/i, 'MPL-1.1'],
  [/\/\/(?:[a-z0-9-]+\.)*mozilla\.org\/MPL\/MPL-1\.1/i, 'MPL-1.1'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/legal\/epl-2\.0/i, 'EPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/org\/documents\/epl-2\.0/i, 'EPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/org\/documents\/epl-v10/i, 'EPL-1.0'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/license\/epl-2\.0/i, 'EPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/legal\/epl-v10/i, 'EPL-1.0'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/legal\/epl/i, 'EPL-2.0'],
  [/\/\/(?:[a-z0-9-]+\.)*eclipse\.org\/org\/documents\/edl-v10/i, 'BSD-3-Clause'],
  [/\/\/(?:[a-z0-9-]+\.)*glassfish\.dev\.java\.net/i, 'CDDL-1.0'],
  [/\/\/(?:[a-z0-9-]+\.)*glassfish\.java\.net/i, 'CDDL-1.0'],
  [/\/\/(?:[a-z0-9-]+\.)*sun\.com\/cddl/i, 'CDDL-1.0'],
  // CDDL-1.1 OR GPL-2.0 with the Classpath exception. Both options are
  // copyleft, so the CDDL id stands for the pair.
  [/\/\/(?:[a-z0-9-]+\.)*oss\.oracle\.com\/licenses\/CDDL\+GPL-1\.1/i, 'CDDL-1.1'],
];

/** The first OSGi attribute or directive of a header entry, and everything
 * after it. */
const ATTRIBUTE = /;\s*[A-Za-z][\w.-]*\s*:?=.*$/s;

/**
 * Split an OSGi `Bundle-License` list at commas outside double quotes. A
 * `description="Apache License, Version 2.0"` attribute holds a comma that
 * is not a separator.
 */
function splitEntries(value: string): string[] {
  const out: string[] = [];
  let start = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) {
      out.push(value.slice(start, i));
      start = i + 1;
    }
  }
  out.push(value.slice(start));
  return out.map((e) => e.trim()).filter(Boolean);
}

/**
 * Strip OpenNMS / CycloneDX tooling artifacts and surrounding quotes,
 * returning a canonical token suitable for downstream lookup.
 */
function cleanValue(raw: string): string {
  if (!raw) return '';
  let v = raw.trim();
  // Strip OSGi attributes and directives (";link=…", ";description=…",
  // ";name:=…"). OpenNMS tooling emits the ";link=" form too. (#308)
  v = v.replace(ATTRIBUTE, '').trim();
  // Strip surrounding quotes.
  v = v.replace(/^["']|["']$/g, '').trim();
  // The Classpath exception moves a GPL down to copyleft, so it must be
  // recognized before the exception tail is stripped below. (#261)
  if (/classpath/i.test(v) && /\bgpl|general public license/i.test(v)) {
    return 'GPL-2.0-with-classpath-exception';
  }
  // Strip any other "with <exception>" tail; those don't change the category.
  v = v.replace(/\s+with\s+.*$/i, '').trim();
  // Strip a "LicenseRef-" prefix when followed by a recognizable SPDX id;
  // some tools encode the actual id inside the ref name.
  const refMatch = v.match(/^LicenseRef-+(.+)$/);
  if (refMatch && refMatch[1]) {
    const inner = refMatch[1].trim();
    const lower = inner.toLowerCase();
    if (TABLE_LC.has(lower) || SCANCODE.has(lower) || NAME_ALIASES[lower]) {
      v = inner;
    }
  }
  return v;
}

/**
 * Try every recognition strategy on a single token (i.e., not a compound
 * expression). Returns null when nothing matches; the caller picks
 * the fallback category.
 */
function lookupToken(rawToken: string): LicenseCategory | null {
  const cleaned = cleanValue(rawToken);
  if (!cleaned) return null;
  if (cleaned === 'NOASSERTION') return 'undeclared';

  // Direct SPDX id, FSF table first.
  const lower = cleaned.toLowerCase();
  const fsf = TABLE_LC.get(lower);
  if (fsf) return fsf;

  // Alias (case-insensitive).
  const aliasId = NAME_ALIASES[lower]?.toLowerCase();
  const aliasCat = aliasId && (TABLE_LC.get(aliasId) ?? SCANCODE.get(aliasId));
  if (aliasCat) return aliasCat;

  // Any other SPDX id, per ScanCode.
  const scancode = SCANCODE.get(lower);
  if (scancode) return scancode;

  // URL pattern. OSI moved from /licenses/<id> to /license/<id>; fold the
  // new form onto the old so the host-anchored patterns cover both. (#261)
  const url = cleaned.replace('opensource.org/license/', 'opensource.org/licenses/');
  for (const [re, id] of URL_PATTERNS) {
    if (re.test(url)) return TABLE[id] ?? 'unrecognized';
  }

  // Bare "Public Domain"-style names.
  if (/^public\s+domain$/i.test(cleaned)) return 'public-domain';

  return null;
}

function maxCategory(cats: LicenseCategory[]): LicenseCategory {
  return cats.reduce((a, b) =>
    SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b,
  );
}

function minCategory(cats: LicenseCategory[]): LicenseCategory {
  return cats.reduce((a, b) =>
    SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b,
  );
}

/**
 * Classify a (possibly compound) SPDX-style license expression.
 *   AND → take the most restrictive sub-category (both apply to the user)
 *   OR  → take the least restrictive sub-category (user picks)
 *   parens → stripped for splitting purposes
 */
function classifyExpression(expr: string): LicenseCategory {
  const clean = expr.replace(/[()]/g, ' ').trim();
  if (!clean) return 'undeclared';

  if (/\s+AND\s+/i.test(clean)) {
    const parts = clean.split(/\s+AND\s+/i).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return maxCategory(parts.map((p) => classifyExpression(p)));
    }
  }
  if (/\s+OR\s+/i.test(clean)) {
    const parts = clean.split(/\s+OR\s+/i).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 0) {
      return minCategory(parts.map((p) => classifyExpression(p)));
    }
  }

  return lookupToken(clean) ?? 'unrecognized';
}

/** One list entry, without the url fallback. Null when not recognized. */
function classifyEntry(entry: string): LicenseCategory | null {
  const cleaned = cleanValue(entry);
  if (/\s+(AND|OR)\s+/i.test(cleaned)) {
    const cat = classifyExpression(cleaned);
    return cat === 'unrecognized' ? null : cat;
  }
  return lookupToken(cleaned);
}

/**
 * Classify a license into one of seven categories.
 *
 *   null / undefined / NOASSERTION  → undeclared
 *   kind: "id"   → SPDX lookup, alias normalization, URL match
 *   kind: "name" → same path as "id" — many tools emit non-canonical names
 *   kind: "expression" → tokenize by AND/OR and combine sub-categories
 */
export function classifyLicense(
  license: License | null | undefined,
): LicenseCategory {
  if (!license) return 'undeclared';

  const value = license.value?.trim();
  if (!value || value === 'NOASSERTION') return 'undeclared';

  if (license.kind === 'expression') {
    return classifyExpression(value);
  }

  // A license list (OSGi Bundle-License, or a Maven <licenses> list joined
  // by syft): the entries are alternatives, so the least restrictive one
  // decides. The Maven model: "If multiple licenses are listed, it is
  // assumed that the user can select any of them, not that they must
  // accept all." Split only when every entry is recognized on its own; a
  // comma inside a name ("Apache License, Version 2.0") leaves a fragment
  // that is not, and the value is then classified whole. (#308)
  const entries = splitEntries(value);
  if (entries.length > 1) {
    const cats = entries.map(classifyEntry);
    if (cats.every((c): c is LicenseCategory => c !== null)) {
      return minCategory(cats);
    }
  }

  // kind: 'id' or 'name'. Some "id" values from CycloneDX aren't real SPDX
  // ids (e.g., "GPLv2+"), so we run both kinds through the same normalizer.
  // If the cleaned value still contains AND/OR, treat it as an expression.
  const cleaned = cleanValue(value);
  if (/\s+(AND|OR)\s+/i.test(cleaned)) {
    return classifyExpression(cleaned);
  }
  // Fall back to the license URL when the name alone is not enough. (#261)
  return (
    lookupToken(cleaned) ??
    (license.url ? lookupToken(license.url) : null) ??
    'unrecognized'
  );
}

/**
 * Pick the dominant license for a component when classifying it as a whole.
 * For a multi-license component we report the category of the *first*
 * recognized license — components rarely carry contradictory categories;
 * when they do (e.g., dual MIT OR GPL-2.0), the first listed in the SBOM
 * is the SBOM author's preferred declaration.
 */
export function classifyComponent(
  licenses: readonly License[],
): LicenseCategory {
  if (!licenses || licenses.length === 0) return 'undeclared';
  return classifyLicense(licenses[0] ?? null);
}
