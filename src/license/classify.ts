// SPDX-id → license category lookup.
//
// AUTHORITY: Free Software Foundation license list at
//   https://www.gnu.org/licenses/license-list.html
//
// Each entry's category is justified by the FSF's classification at the URL
// above. Disputes about a placement should be raised by linking the FSF page
// for that license. The taxonomy here intentionally compresses several FSF
// distinctions into six buckets — Permissive vs. Copyleft is the most useful
// split for a viewer audience that includes legal/procurement, not just
// engineers.
//
// Beyond the canonical SPDX-id lookup (TABLE), this module also handles the
// messy real-world inputs found in CycloneDX and SPDX SBOMs:
//   - free-form name aliases (GPLv2+, ASL 2.0, "Apache License Version 2.0")
//   - URL-as-license-value (gnu.org/licenses/lgpl, eclipse.org/legal/epl-…)
//   - compound expressions (Apache-2.0 AND LGPL-2.1, MIT OR GPL-2.0)
//   - OpenNMS-tooling artifacts ("BSD-3-Clause;link=https://…")

import type { License, LicenseCategory } from '../types';

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

  // Eclipse
  'eclipse public license': 'EPL-2.0',
  'eclipse public license 2.0': 'EPL-2.0',
  'eclipse public license, version 2.0': 'EPL-2.0',

  // CDDL
  cddl: 'CDDL-1.0',
  'cddl 1.0': 'CDDL-1.0',
  'common development and distribution license': 'CDDL-1.0',

  // Misc
  python: 'Python-2.0',
  'public domain': 'CC0-1.0',
  'the mit license': 'MIT',
  'mit license': 'MIT',
};

/**
 * URL substring patterns mapped to the SPDX id they identify. Used when a
 * `kind: name` license value contains a URL. Order matters — more specific
 * patterns should appear before generic ones (e.g., gnu.org/licenses/lgpl-3.0
 * before gnu.org/licenses/lgpl).
 */
const URL_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/apache\.org\/licenses\/LICENSE-2\.0/i, 'Apache-2.0'],
  [/opensource\.org\/licenses\/MIT/i, 'MIT'],
  [/opensource\.org\/licenses\/BSD-3-Clause/i, 'BSD-3-Clause'],
  [/opensource\.org\/licenses\/BSD-2-Clause/i, 'BSD-2-Clause'],
  [/opensource\.org\/licenses\/ISC/i, 'ISC'],
  [/opensource\.org\/licenses\/Apache-2\.0/i, 'Apache-2.0'],
  [/gnu\.org\/licenses\/agpl/i, 'AGPL-3.0-or-later'],
  [/gnu\.org\/licenses\/lgpl-3\.0/i, 'LGPL-3.0'],
  [/gnu\.org\/licenses\/lgpl-2\.1/i, 'LGPL-2.1'],
  [/gnu\.org\/licenses\/lgpl/i, 'LGPL-3.0-or-later'],
  [/gnu\.org\/licenses\/gpl-3\.0/i, 'GPL-3.0'],
  [/gnu\.org\/licenses\/gpl-2\.0/i, 'GPL-2.0'],
  [/gnu\.org\/licenses\/gpl/i, 'GPL-3.0-or-later'],
  [/mozilla\.org\/MPL\/2\.0/i, 'MPL-2.0'],
  [/mozilla\.org\/MPL\/1\.1/i, 'MPL-1.1'],
  [/eclipse\.org\/legal\/epl-2\.0/i, 'EPL-2.0'],
  [/eclipse\.org\/legal\/epl-v10/i, 'EPL-1.0'],
  [/eclipse\.org\/legal\/epl/i, 'EPL-2.0'],
  [/eclipse\.org\/org\/documents\/edl-v10/i, 'BSD-3-Clause'],
  [/glassfish\.dev\.java\.net/i, 'CDDL-1.0'],
  [/glassfish\.java\.net/i, 'CDDL-1.0'],
  [/sun\.com\/cddl/i, 'CDDL-1.0'],
];

/**
 * Strip OpenNMS / CycloneDX tooling artifacts and surrounding quotes,
 * returning a canonical token suitable for downstream lookup.
 */
function cleanValue(raw: string): string {
  if (!raw) return '';
  let v = raw.trim();
  // Strip OpenNMS ";link=…" suffix.
  v = v.replace(/;\s*link\s*=.*$/i, '').trim();
  // Strip surrounding quotes.
  v = v.replace(/^["']|["']$/g, '').trim();
  // Strip "with <exception>" tail — we don't differentiate by exception in v1.
  v = v.replace(/\s+with\s+.*$/i, '').trim();
  // Strip a "LicenseRef-" prefix when followed by a recognizable SPDX id;
  // some tools encode the actual id inside the ref name.
  const refMatch = v.match(/^LicenseRef-+(.+)$/);
  if (refMatch && refMatch[1]) {
    const inner = refMatch[1].trim();
    if (TABLE[inner] || NAME_ALIASES[inner.toLowerCase()]) {
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

  // Direct SPDX id.
  if (TABLE[cleaned]) return TABLE[cleaned]!;

  // Alias (case-insensitive).
  const aliasId = NAME_ALIASES[cleaned.toLowerCase()];
  if (aliasId && TABLE[aliasId]) return TABLE[aliasId]!;

  // URL pattern.
  for (const [re, id] of URL_PATTERNS) {
    if (re.test(cleaned)) return TABLE[id] ?? 'unrecognized';
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

  // kind: 'id' or 'name'. Some "id" values from CycloneDX aren't real SPDX
  // ids (e.g., "GPLv2+"), so we run both kinds through the same normalizer.
  // If the cleaned value still contains AND/OR, treat it as an expression.
  const cleaned = cleanValue(value);
  if (/\s+(AND|OR)\s+/i.test(cleaned)) {
    return classifyExpression(cleaned);
  }
  return lookupToken(cleaned) ?? 'unrecognized';
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
