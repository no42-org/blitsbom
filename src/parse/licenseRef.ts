import type {
  License,
  SpdxDocument,
  SpdxExtractedLicensingInfo,
} from '../types';
import { normalizeLicenseValue } from './licenseValue';

/**
 * Build a per-document Map<licenseRefId, License> by walking
 * `hasExtractedLicensingInfos` once. The map is queried during package
 * normalization to resolve `LicenseRef-*` values to recognizable SPDX ids.
 */
export function buildLicenseRefMap(
  doc: SpdxDocument,
): Map<string, License> {
  const map = new Map<string, License>();
  const infos = Array.isArray(doc.hasExtractedLicensingInfos)
    ? doc.hasExtractedLicensingInfos
    : [];
  for (const info of infos) {
    if (!info || typeof info.licenseId !== 'string') continue;
    map.set(info.licenseId, resolveLicenseRef(info));
  }
  return map;
}

/**
 * Resolution order:
 *   1. Match `extractedText` against signature regexes for ~13 common licenses.
 *   2. Match `seeAlsos[]` URLs against canonical license URLs.
 *   3. Match the `name` field — both for quoted SPDX ids
 *      (`"Apache-2.0";link="..."`) and for embedded canonical URLs.
 *   4. Parse the `licenseId` itself — tools like the OpenNMS SBOM generator
 *      embed the SPDX id directly in the ref name
 *      (`LicenseRef--Apache-2.0--link--...`).
 *   5. Fall back to a name-kind license carrying the human-readable text;
 *      classifier will treat it as proprietary since we couldn't recognize it.
 */
export function resolveLicenseRef(
  info: SpdxExtractedLicensingInfo,
): License {
  // 1. Signature match on extractedText.
  const text = info.extractedText ?? '';
  const sig = matchSignature(text);
  if (sig) return { kind: 'id', value: sig };

  // 2. seeAlsos URL match.
  const seeAlsos = Array.isArray(info.seeAlsos) ? info.seeAlsos : [];
  for (const url of seeAlsos) {
    const fromUrl = matchUrl(url);
    if (fromUrl) return { kind: 'id', value: fromUrl };
  }

  // 3. Pull from the `name` field. Three patterns observed in the wild:
  //      `"Apache-2.0";link="https://..."`        → quoted id, URL stripped
  //      `BSD-3-Clause;link=https://asm.ow2.io/…` → unquoted id, URL stripped
  //      `Apache License 2.0`                      → URL-match in the same string
  //      `(MIT OR Apache-2.0)`                     → can't pick one; bail
  // Run normalizeLicenseValue first so the matchers below see the clean
  // bare id, and lift the captured URL for the fallback case.
  const rawName = typeof info.name === 'string' ? info.name : '';
  const normName = normalizeLicenseValue(rawName);
  const fromName = matchFromName(normName.value);
  if (fromName) {
    if (!fromName.url && normName.url) fromName.url = normName.url;
    return fromName;
  }

  // 4. Parse the licenseId itself for tooling-specific patterns
  //    like `LicenseRef--Apache-2.0--link--...`.
  const fromId = matchFromLicenseId(info.licenseId);
  if (fromId) {
    const license: License = { kind: 'id', value: fromId };
    if (normName.url) license.url = normName.url;
    return license;
  }

  // 5. Fallback: surface a human-readable name so the table cell is
  //    sensible. Classifier will mark it proprietary because we couldn't
  //    recognize it.
  const display = normName.value || info.licenseId;
  const out: License = { kind: 'name', value: display };
  if (normName.url) {
    out.url = normName.url;
  } else if (seeAlsos.length > 0 && typeof seeAlsos[0] === 'string') {
    out.url = seeAlsos[0];
  }
  return out;
}

interface Signature {
  id: string;
  patterns: RegExp[];
}

const SIGNATURES: Signature[] = [
  // Apache-2.0 has the unique header "Apache License\nVersion 2.0".
  { id: 'Apache-2.0', patterns: [/Apache License/i, /Version 2\.0/i] },
  // GPL family — order matters: more-specific (AGPL, LGPL) before generic GPL.
  {
    id: 'AGPL-3.0',
    patterns: [/GNU Affero General Public License/i, /Version 3/i],
  },
  {
    id: 'LGPL-3.0',
    patterns: [/GNU Lesser General Public License/i, /Version 3/i],
  },
  {
    id: 'LGPL-2.1',
    patterns: [/GNU Lesser General Public License/i, /Version 2\.1/i],
  },
  { id: 'GPL-3.0', patterns: [/GNU General Public License/i, /Version 3/i] },
  { id: 'GPL-2.0', patterns: [/GNU General Public License/i, /Version 2/i] },
  { id: 'MPL-2.0', patterns: [/Mozilla Public License/i, /Version 2\.0/i] },
  { id: 'EPL-2.0', patterns: [/Eclipse Public License/i, /v\.?\s*2\.0/i] },
  { id: 'EPL-1.0', patterns: [/Eclipse Public License/i, /v\.?\s*1\.0/i] },
  {
    id: 'CDDL-1.0',
    patterns: [
      /Common Development and Distribution License/i,
      /Version 1\.0/i,
    ],
  },
  // BSD 3-Clause has the "neither the name of" clause; check before 2-Clause.
  {
    id: 'BSD-3-Clause',
    patterns: [
      /Redistribution and use in source and binary forms/i,
      /Neither the name of/i,
    ],
  },
  {
    id: 'BSD-2-Clause',
    patterns: [
      /Redistribution and use in source and binary forms/i,
      /THIS SOFTWARE IS PROVIDED/i,
    ],
  },
  {
    id: 'ISC',
    patterns: [/Permission to use, copy, modify, and(?:\/or)?\s+distribute/i],
  },
  // MIT must come after BSD because both share the same warranty disclaimer.
  {
    id: 'MIT',
    patterns: [
      /Permission is hereby granted, free of charge, to any person obtaining a copy/i,
      /THE SOFTWARE IS PROVIDED/i,
    ],
  },
];

export function matchSignature(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  for (const sig of SIGNATURES) {
    if (sig.patterns.every((p) => p.test(text))) {
      if (sig.id === 'BSD-2-Clause' && /Neither the name of/i.test(text)) {
        continue;
      }
      return sig.id;
    }
  }
  return null;
}

const URL_MAP: Array<[RegExp, string]> = [
  [/apache\.org\/licenses\/LICENSE-2\.0/i, 'Apache-2.0'],
  [/opensource\.org\/licenses\/MIT/i, 'MIT'],
  [/opensource\.org\/licenses\/BSD-3-Clause/i, 'BSD-3-Clause'],
  [/opensource\.org\/licenses\/BSD-2-Clause/i, 'BSD-2-Clause'],
  [/opensource\.org\/licenses\/ISC/i, 'ISC'],
  [/gnu\.org\/licenses\/agpl(?:-3\.0)?/i, 'AGPL-3.0'],
  [/gnu\.org\/licenses\/lgpl-3\.0/i, 'LGPL-3.0'],
  [/gnu\.org\/licenses\/lgpl-2\.1/i, 'LGPL-2.1'],
  [/gnu\.org\/licenses\/lgpl/i, 'LGPL-3.0'],
  [/gnu\.org\/licenses\/gpl-3\.0/i, 'GPL-3.0'],
  [/gnu\.org\/licenses\/gpl-2\.0/i, 'GPL-2.0'],
  [/gnu\.org\/licenses\/gpl/i, 'GPL-3.0'],
  [/mozilla\.org\/MPL\/2\.0/i, 'MPL-2.0'],
  [/eclipse\.org\/legal\/epl-2\.0/i, 'EPL-2.0'],
  [/eclipse\.org\/legal\/epl-v10/i, 'EPL-1.0'],
];

export function matchUrl(url: string): string | null {
  if (typeof url !== 'string') return null;
  for (const [re, id] of URL_MAP) {
    if (re.test(url)) return id;
  }
  return null;
}

/**
 * Set of canonical SPDX ids we will accept as direct hits when discovered
 * inside a `name` or `licenseId` string. Intentionally narrow — we'd rather
 * leave a license as proprietary than misidentify a near-match.
 */
const KNOWN_SPDX_IDS = new Set<string>([
  'Apache-2.0',
  'Apache-1.1',
  'Apache-1.0',
  'MIT',
  'MIT-0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-4-Clause',
  'ISC',
  'Zlib',
  'BSL-1.0',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'WTFPL',
  'PostgreSQL',
  'Artistic-2.0',
  'Python-2.0',
  'GPL-2.0',
  'GPL-3.0',
  'LGPL-2.1',
  'LGPL-3.0',
  'AGPL-3.0',
  'MPL-2.0',
  'EPL-1.0',
  'EPL-2.0',
  'CDDL-1.0',
  'CDDL-1.1',
]);

/**
 * Inspect a `name` field. Two real-world patterns:
 *   `"Apache-2.0";link="https://..."`  → `Apache-2.0` (quoted single id)
 *   `Apache License Version 2.0`       → URL-match in the same string
 *   `(MIT OR Apache-2.0)`              → can't pick one; bail
 */
function matchFromName(name: string): License | null {
  if (!name || typeof name !== 'string') return null;
  const trimmed = name.trim();
  if (!trimmed) return null;

  // Quoted single-id: `"Apache-2.0";link="..."`. Take the first quoted token.
  const quoted = trimmed.match(/^"([^"]+)"/);
  if (quoted && quoted[1] && KNOWN_SPDX_IDS.has(quoted[1])) {
    return { kind: 'id', value: quoted[1] };
  }

  // Embedded URL — the whole name might be `Apache License 2.0 ...` plus a
  // link section. URL_MAP knows the canonical hosts.
  const fromUrl = matchUrl(trimmed);
  if (fromUrl) return { kind: 'id', value: fromUrl };

  // Bare single-token id (no quotes), e.g. `Apache-2.0`.
  const oneToken = trimmed.match(/^([A-Za-z0-9.\-+]+)$/);
  if (oneToken && oneToken[1] && KNOWN_SPDX_IDS.has(oneToken[1])) {
    return { kind: 'id', value: oneToken[1] };
  }

  return null;
}

/**
 * Inspect the `licenseId` itself for tool-specific encodings. The OpenNMS
 * SBOM generator emits ids like:
 *   `LicenseRef--Apache-2.0--link--https---www.apache.org-licenses-LICENSE-2.0.txt-`
 *   `LicenseRef--MIT-`
 */
function matchFromLicenseId(licenseId: string): string | null {
  if (typeof licenseId !== 'string') return null;
  const stripped = licenseId.replace(/^LicenseRef-+/, '');
  if (!stripped) return null;

  // First chunk before any `--link--` separator is the candidate id.
  const head = stripped.split(/--link--|--/)[0]?.replace(/-+$/, '') ?? '';
  if (head && KNOWN_SPDX_IDS.has(head)) return head;

  // The candidate may have a trailing dash or plus we should normalize.
  const compact = head.replace(/[+]+$/, '');
  if (compact && KNOWN_SPDX_IDS.has(compact)) return compact;

  return null;
}
