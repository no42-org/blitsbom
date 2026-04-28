import type {
  Component,
  License,
  LoadedSbom,
  SbomMetadata,
  SpdxDocument,
  SpdxPackage,
} from '../types';
import { isNoAssertion, emptyToNull } from './util';
import { buildLicenseRefMap } from './licenseRef';
import { normalizeLicenseValue } from './licenseValue';
import { canonicalizePurl } from './purlMatch';

export function isSpdxDocument(value: unknown): value is SpdxDocument {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.spdxVersion === 'string' && /^SPDX-2\.[0-9]+$/.test(v.spdxVersion)
  );
}

export function normalizeSpdxDocument(doc: SpdxDocument): LoadedSbom {
  const licenseRefMap = buildLicenseRefMap(doc);
  const packages = Array.isArray(doc.packages) ? doc.packages : [];
  const components = packages.map((p) => normalizeSpdxPackage(p, licenseRefMap));
  return { metadata: normalizeSpdxMetadata(doc), components };
}

function normalizeSpdxMetadata(doc: SpdxDocument): SbomMetadata {
  return {
    projectName: emptyToNull(doc.name),
    timestamp: emptyToNull(doc.creationInfo?.created),
    specVersion: doc.spdxVersion,
    sbomFormat: 'SPDX-2.x',
    // SPDX 2.x has no first-class vulnerabilities concept; report 0.
    vulnerabilityCount: 0,
  };
}

export function normalizeSpdxPackage(
  pkg: SpdxPackage,
  licenseRefMap: Map<string, License>,
): Component {
  const licenses = resolvePackageLicenses(pkg, licenseRefMap);
  const purl = extractPurl(pkg);
  // SPDX has both `originator` (the upstream creator) and `supplier`
  // (the entity that delivered this package). Many tools fill only one;
  // for the originator field we prefer `originator` and fall back to
  // `supplier`. The publisher field follows the historical mapping.
  const originator =
    parseSpdxAgent(pkg.originator) ?? parseSpdxAgent(pkg.supplier);
  return {
    type: 'library',
    group: emptyToNull(extractGroupFromPurl(purl)),
    name: pkg.name,
    version: isNoAssertion(pkg.versionInfo) ? null : emptyToNull(pkg.versionInfo) ,
    description: null,
    publisher: parseSpdxAgent(pkg.supplier) ?? parseSpdxAgent(pkg.originator),
    originator,
    scope: null,
    purl,
    purlCanonical: canonicalizePurl(purl),
    // SPDX has no equivalent of CDX bom-ref for cross-document join;
    // SPDXID is document-internal. Leave null.
    bomRef: null,
    licenses,
    vulnerabilities: [],
  };
}

function resolvePackageLicenses(
  pkg: SpdxPackage,
  licenseRefMap: Map<string, License>,
): License[] {
  const concluded = pkg.licenseConcluded;
  if (!isNoAssertion(concluded)) {
    return parseLicenseExpression(concluded!, licenseRefMap);
  }
  const declared = pkg.licenseDeclared;
  if (!isNoAssertion(declared)) {
    return parseLicenseExpression(declared!, licenseRefMap);
  }
  return [];
}

/**
 * SPDX licenses can be:
 *   - a single SPDX id ("Apache-2.0")
 *   - a LicenseRef-* ("LicenseRef-foo") resolved via hasExtractedLicensingInfos
 *   - a compound expression ("MIT OR Apache-2.0")
 *
 * For v1 we keep compound expressions as `kind: "expression"` (matching
 * CycloneDX behavior) but split simple "A AND B" / "A OR B" cases when both
 * sides are recognizable single ids/refs.
 */
function parseLicenseExpression(
  raw: string,
  licenseRefMap: Map<string, License>,
): License[] {
  const value = raw.trim();
  if (!value || isNoAssertion(value)) return [];

  // Single token (no AND / OR / parens) — most common case in real SBOMs.
  if (!/\s+(AND|OR)\s+|[()]/.test(value)) {
    return [resolveSingleToken(value, licenseRefMap)];
  }

  // Compound expression — preserve verbatim. Classifier will treat as
  // proprietary; rendering shows the full expression in the table cell.
  return [{ kind: 'expression', value }];
}

function resolveSingleToken(
  token: string,
  licenseRefMap: Map<string, License>,
): License {
  if (token.startsWith('LicenseRef-')) {
    const resolved = licenseRefMap.get(token);
    if (resolved) return resolved;
    // No resolution available; surface the ref id as a name-kind license
    // so it renders verbatim and classifies as proprietary.
    return { kind: 'name', value: token };
  }
  // Strip parse-time tooling artifacts ( ;link=URL, surrounding quotes,
  // "with <exception>") and lift the URL into License.url if present.
  const norm = normalizeLicenseValue(token);
  const license: License = { kind: 'id', value: norm.value };
  if (norm.url) license.url = norm.url;
  return license;
}

function extractPurl(pkg: SpdxPackage): string | null {
  const refs = Array.isArray(pkg.externalRefs) ? pkg.externalRefs : [];
  for (const ref of refs) {
    if (!ref || typeof ref.referenceType !== 'string') continue;
    if (ref.referenceType === 'purl') {
      return emptyToNull(ref.referenceLocator);
    }
  }
  return null;
}

function extractGroupFromPurl(purl: string | null): string | null {
  if (!purl) return null;
  // pkg:maven/org.example/foo@1.2.3?type=jar  → group is "org.example"
  // pkg:npm/@scope/foo@1.0.0                  → group is "@scope"
  // pkg:pypi/foo@1.0.0                        → no group
  const m = purl.match(/^pkg:[^/]+\/([^/?#@]+)\/[^?#@]+/);
  return m && m[1] ? m[1] : null;
}

/**
 * Strip the SPDX agent prefix and return the bare name. Both `supplier`
 * and `originator` use the same encoding: "Organization: Foo" or
 * "Person: Foo Bar <foo@bar>". Returns null for empty / NOASSERTION.
 */
function parseSpdxAgent(raw: string | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || isNoAssertion(trimmed)) return null;
  const m = trimmed.match(/^(?:Organization|Person)\s*:\s*(.+)$/i);
  return m && m[1] ? m[1].trim() : trimmed;
}
