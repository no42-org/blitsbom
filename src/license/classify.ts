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

import type { License, LicenseCategory } from '../types';

interface CategoryMeta {
  id: LicenseCategory;
  label: string;
  /** CSS variable name (without leading --) declared in @theme static. */
  colorToken: string;
  /** Stable display order — left-to-right in legend, clockwise in donut. */
  order: number;
}

export const CATEGORY_METADATA: readonly CategoryMeta[] = [
  {
    id: 'permissive',
    label: 'Permissive',
    colorToken: 'color-license-permissive',
    order: 1,
  },
  {
    id: 'public-domain',
    label: 'Public Domain',
    colorToken: 'color-license-public-domain',
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
    id: 'undeclared',
    label: 'Undeclared',
    colorToken: 'color-license-undeclared',
    order: 6,
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
  'PostgreSQL': 'permissive',
  'Artistic-2.0': 'permissive',
  'Python-2.0': 'permissive',
  // Apache-1.x is non-copyleft per FSF (incompatible with GPLv2 but permissive).
  'Apache-1.0': 'permissive',
  'Apache-1.1': 'permissive',

  // Weak / file-scoped copyleft — FSF "GPL-compatible free software licenses
  // with copyleft of varying strength".
  'LGPL-2.0': 'copyleft',
  'LGPL-2.0-only': 'copyleft',
  'LGPL-2.0-or-later': 'copyleft',
  'LGPL-2.1': 'copyleft',
  'LGPL-2.1-only': 'copyleft',
  'LGPL-2.1-or-later': 'copyleft',
  'LGPL-3.0': 'copyleft',
  'LGPL-3.0-only': 'copyleft',
  'LGPL-3.0-or-later': 'copyleft',
  // MPL-2.0 is file-level copyleft per FSF.
  'MPL-2.0': 'copyleft',
  // EPL — FSF treats as a (weak) copyleft license; placed here.
  'EPL-1.0': 'copyleft',
  'EPL-2.0': 'copyleft',
  'CDDL-1.0': 'copyleft',
  'CDDL-1.1': 'copyleft',

  // Strong / project-level copyleft.
  'GPL-2.0': 'strong-copyleft',
  'GPL-2.0-only': 'strong-copyleft',
  'GPL-2.0-or-later': 'strong-copyleft',
  'GPL-3.0': 'strong-copyleft',
  'GPL-3.0-only': 'strong-copyleft',
  'GPL-3.0-or-later': 'strong-copyleft',
  // AGPL is "network copyleft" — FSF classifies as a strong copyleft GPL
  // variant; placed here so corporate users can see it as the strongest tier.
  'AGPL-3.0': 'strong-copyleft',
  'AGPL-3.0-only': 'strong-copyleft',
  'AGPL-3.0-or-later': 'strong-copyleft',
};

/**
 * Classify a license into one of six categories.
 *
 *   null / undefined / NOASSERTION  → undeclared
 *   kind: "id"   → look up in TABLE; unknown → proprietary
 *   kind: "name" → proprietary (free-form names can't be verified)
 *   kind: "expression" → proprietary (compound, can't single-classify)
 */
export function classifyLicense(license: License | null | undefined): LicenseCategory {
  if (!license) return 'undeclared';

  const value = license.value?.trim();
  if (!value || value === 'NOASSERTION') return 'undeclared';

  if (license.kind === 'id') {
    return TABLE[value] ?? 'proprietary';
  }

  return 'proprietary';
}

/**
 * Pick the dominant license for a component when classifying it as a whole.
 * For a multi-license component we report the category of the *first*
 * recognized license — components rarely carry contradictory categories;
 * when they do (e.g., dual MIT OR GPL-2.0), the first listed in the SBOM
 * is the SBOM author's preferred declaration.
 */
export function classifyComponent(licenses: readonly License[]): LicenseCategory {
  if (!licenses || licenses.length === 0) return 'undeclared';
  return classifyLicense(licenses[0] ?? null);
}
