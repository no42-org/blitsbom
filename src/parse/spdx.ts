import type {
  Component,
  License,
  LoadedSbom,
  SbomMetadata,
  SpdxDocument,
  SpdxPackage,
} from '../types';
import { isNoAssertion, emptyToNull, isRecord } from './util';
import { buildLicenseRefMap } from './licenseRef';
import { normalizeLicenseValue } from './licenseValue';
import { canonicalizePurl, originatorFromPurl } from './purlMatch';

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
  // See normalizeCdxBom: skip malformed entries instead of throwing.
  const usable = packages.filter((p): p is SpdxPackage => isRecord(p));
  const rootId = findDocumentRootId(doc);
  const listed =
    rootId !== null && usable.length > 1
      ? usable.filter((p) => p.SPDXID !== rootId)
      : usable;
  // Second lift, disjoint from the first: a dependency-graph root is not the
  // document's subject (nothing DESCRIBES it) but is equally not a component.
  const graphRootIds = findGraphRootIds(doc, listed);
  const kept =
    graphRootIds.size > 0
      ? listed.filter((p) => !graphRootIds.has(p.SPDXID as string))
      : listed;
  const components = kept.map((p) => normalizeSpdxPackage(p, licenseRefMap));
  // normalizeSpdxMetadata reads doc.packages, not the filtered list, so the
  // header keeps the scan target's name and version after the row is gone.
  return { metadata: normalizeSpdxMetadata(doc), components };
}

/**
 * The SPDXID of the package the document is *about*, or null when the
 * document does not identify exactly one.
 *
 * SPDX keeps the document's subject inside `packages[]`; CycloneDX keeps it
 * outside `components[]` as `metadata.component`. Lifting the SPDX one out of
 * the component list restores parity: a syft scan target — "." for a
 * directory scan, the image reference for an image — is the thing being
 * described, not a thing it contains, and as a component row it is
 * contentless (no version, no license) while inflating the component count
 * and the Undeclared license bucket. (#145)
 *
 * Only a *sole* described package is lifted. Documents that describe several
 * packages use DESCRIBES to mean "these are the top-level components", and
 * removing those would delete real data. Deliberately no match on syft's
 * `SPDXRef-DocumentRoot-` prefix (other generators use `SPDXRef-RootPackage`
 * or hashed ids) and none on `primaryPackagePurpose` (absent in SPDX 2.2).
 */
function findDocumentRootId(doc: SpdxDocument): string | null {
  const fromRelationships = (
    Array.isArray(doc.relationships) ? doc.relationships : []
  )
    .filter(isRecord)
    .filter(
      (r) =>
        r.relationshipType === 'DESCRIBES' &&
        r.spdxElementId === 'SPDXRef-DOCUMENT',
    )
    .map((r) => r.relatedSpdxElement);
  // `documentDescribes` is the 2.2+ shorthand for the same statement; the
  // explicit relationship wins when a document carries both.
  const raw =
    fromRelationships.length > 0
      ? fromRelationships
      : Array.isArray(doc.documentDescribes)
        ? doc.documentDescribes
        : [];
  const ids = new Set(raw.filter((id): id is string => typeof id === 'string'));
  return ids.size === 1 ? [...ids][0]! : null;
}

/**
 * SPDXIDs of packages that are the root of a dependency graph rather than a
 * member of one — syft emits a Go main module from `go.mod` alongside the real
 * dependencies, and it is the thing being scanned, not a thing it contains.
 * Left in the list it inflates the count, pads the Undeclared bucket, and
 * since #169 renders the scanned project as a named originator slice beside
 * its own third parties. (#167)
 *
 * A package qualifies when all four hold:
 *
 *   1. its purl type is `golang`, and
 *   2. it declares no usable version (absent, UNKNOWN, or NOASSERTION), and
 *   3. something declares DEPENDENCY_OF pointing at it, and
 *   4. it is not itself the subject of any DEPENDENCY_OF.
 *
 * Clause 1 looks like the per-ecosystem special-casing this project usually
 * refuses, and it was not in the original design. It is here because the
 * phenomenon *is* ecosystem-specific: `go.mod` has no version field, so syft
 * writes UNKNOWN for a Go main module, while `package.json` requires one. The
 * rule therefore matches its own explanation rather than approximating it.
 *
 * Without it the rule deletes real components. Measured: a git *dev*Dependency
 * arrives versionless, and if it has a transitive dependency of its own it
 * satisfies 2, 3 and 4 —
 *
 *   gitdep      version="UNKNOWN"  (git+ssh://…/gitdep.git#deadbeef)
 *   tiny-helper version="1.2.3"    tiny-helper IS-DEP-OF gitdep
 *
 * — and would silently vanish from a compliance artifact. Clause 4 saves
 * ordinary git dependencies because syft links direct deps to the root
 * package, but it emits no root→devDep edge, which is why blitsbom's own SBOM
 * carries 13 unlinked top-level npm nodes. `downloadLocation` was tried as a
 * discriminator and rejected: `golang.org/x/mod` is NOASSERTION too.
 *
 * Otherwise structural on purpose. No match on package name, on syft's SPDXID
 * prefixes, on `sourceInfo` wording, or on `primaryPackagePurpose` (absent in
 * 2.2) — all generator-specific and liable to change without notice. Same
 * reasoning as findDocumentRootId above.
 */
function findGraphRootIds(
  doc: SpdxDocument,
  listed: readonly SpdxPackage[],
): Set<string> {
  const relationships = Array.isArray(doc.relationships)
    ? doc.relationships
    : [];
  // One pass building two sets: a per-package scan of relationships[] would be
  // quadratic, and real documents are large (nl6 carries 3,514 DEPENDENCY_OF
  // entries against 1,421 packages; opennms-core is bigger still).
  const hasDependencies = new Set<string>();
  const isDependency = new Set<string>();
  for (const r of relationships) {
    if (!isRecord(r) || r.relationshipType !== 'DEPENDENCY_OF') continue;
    if (typeof r.spdxElementId === 'string') isDependency.add(r.spdxElementId);
    if (typeof r.relatedSpdxElement === 'string') {
      hasDependencies.add(r.relatedSpdxElement);
    }
  }
  const roots = new Set<string>();
  if (hasDependencies.size === 0) return roots;
  for (const p of listed) {
    const id = p.SPDXID;
    if (typeof id !== 'string') continue;
    if (!isGolangPackage(p)) continue;
    if (!hasNoUsableVersion(p.versionInfo)) continue;
    if (!hasDependencies.has(id)) continue;
    if (isDependency.has(id)) continue;
    roots.add(id);
  }
  return roots;
}

/** Purl type is exactly `golang`. A package with no purl never qualifies:
 * without an ecosystem there is no basis for the versionless-root inference. */
function isGolangPackage(pkg: SpdxPackage): boolean {
  const purl = extractPurl(pkg);
  return purl !== null && purl.startsWith('pkg:golang/');
}

/**
 * `isNoAssertion` plus UNKNOWN, which syft writes for a Go main module because
 * `go.mod` has no version field. Deliberately not folded into `isNoAssertion`:
 * that helper also governs what the components table displays, and "UNKNOWN"
 * is a value a reader should keep seeing when a package really is listed.
 */
function hasNoUsableVersion(versionInfo: string | undefined): boolean {
  if (isNoAssertion(versionInfo)) return true;
  return versionInfo!.trim().toUpperCase() === 'UNKNOWN';
}

function normalizeSpdxMetadata(doc: SpdxDocument): SbomMetadata {
  return {
    projectName: emptyToNull(doc.name),
    productVersion: extractSpdxProductVersion(doc),
    timestamp: emptyToNull(doc.creationInfo?.created),
    specVersion: doc.spdxVersion,
    sbomFormat: 'SPDX-2.x',
    sbomTool: extractSpdxTool(doc.creationInfo?.creators),
    // SPDX 2.x has no first-class vulnerabilities concept; report 0.
    vulnerabilityCount: 0,
  };
}

/**
 * Version of the product the document describes. SPDX has no dedicated
 * field for it; the pragmatic signal is the `versionInfo` of the package
 * whose `name` matches the document `name` (tools such as syft name the
 * document after the primary package). Null when no such package exists or
 * it carries no version.
 */
function extractSpdxProductVersion(doc: SpdxDocument): string | null {
  const name = emptyToNull(doc.name);
  if (!name) return null;
  const packages = Array.isArray(doc.packages) ? doc.packages : [];
  for (const p of packages) {
    if (!isRecord(p)) continue;
    if (p.name === name && !isNoAssertion(p.versionInfo)) {
      return emptyToNull(p.versionInfo);
    }
  }
  return null;
}

/**
 * The generating tool from `creationInfo.creators`. Each creator is prefixed
 * by its kind: `"Tool: syft-1.18.1"`, `"Person: …"`, `"Organization: …"`.
 * Only `Tool:` entries identify the SBOM generator; the prefix is stripped
 * and the first such entry returned. Null when none is present.
 */
function extractSpdxTool(creators: string[] | undefined): string | null {
  if (!Array.isArray(creators)) return null;
  for (const c of creators) {
    if (typeof c !== 'string') continue;
    const m = c.trim().match(/^Tool\s*:\s*(.+)$/i);
    if (m && m[1]) return m[1].trim();
  }
  return null;
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
  //
  // The purl namespace is the last resort. syft fills originator/supplier
  // only from a jar manifest's `Implementation-Vendor`, which most projects
  // never set, so 40% of a Maven SBOM's components arrive with no declared
  // origin at all while carrying a groupId that states it plainly. A
  // declared value always wins, including one that names the same origin
  // differently than the namespace does. (#169)
  const originator =
    parseSpdxAgent(pkg.originator) ??
    parseSpdxAgent(pkg.supplier) ??
    originatorFromPurl(purl);
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
