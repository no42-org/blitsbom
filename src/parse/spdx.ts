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
  return {
    type: 'library',
    group: emptyToNull(extractGroupFromPurl(purl)),
    name: pkg.name,
    version: isNoAssertion(pkg.versionInfo) ? null : emptyToNull(pkg.versionInfo) ,
    description: null,
    publisher: extractPublisher(pkg.supplier),
    scope: null,
    purl,
    licenses,
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
  return { kind: 'id', value: token };
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

function extractPublisher(supplier: string | undefined): string | null {
  if (!supplier || typeof supplier !== 'string') return null;
  const trimmed = supplier.trim();
  if (!trimmed || isNoAssertion(trimmed)) return null;
  // SPDX format: "Organization: Foo" / "Person: Foo Bar <foo@bar>"
  const m = trimmed.match(/^(?:Organization|Person)\s*:\s*(.+)$/i);
  return m && m[1] ? m[1].trim() : trimmed;
}
