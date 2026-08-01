import type {
  Component,
  License,
  LoadedSbom,
  SbomMetadata,
  SpdxDocument,
  SpdxPackage,
} from '../types';
import { isNoAssertion, emptyToNull, isRecord, NOASSERTION } from './util';
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
  // Membership is by object identity, not by SPDXID: ids are required to be
  // unique but a malformed document can repeat one, and filtering by id would
  // then delete every package sharing it.
  const graphRoots = findGraphRoots(doc, listed);
  const kept =
    graphRoots.size > 0 ? listed.filter((p) => !graphRoots.has(p)) : listed;
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
 * Packages that are the root of a dependency graph rather than a member of one
 * — syft emits a Go main module from `go.mod` alongside the real dependencies,
 * and it is the thing being scanned, not a thing it contains. Left in the list
 * it inflates the count, pads the Undeclared bucket, and since #169 renders the
 * scanned project as a named originator slice beside its own third parties.
 * (#167)
 *
 * A package qualifies when all four hold:
 *
 *   1. its purl type is `golang`, and
 *   2. it declares no usable version (absent, UNKNOWN, or NOASSERTION), and
 *   3. some *listed package* declares a dependency edge pointing at it, and
 *   4. it is not itself a dependency of anything.
 *
 * Clause 1 is the per-ecosystem condition this project usually refuses. It is
 * here because the phenomenon *is* ecosystem-specific: `go.mod` has no version
 * field, so syft writes UNKNOWN for a Go main module, while `package.json`
 * requires one. Scoping the rule to the ecosystem that actually produces
 * versionless project roots keeps it from reaching ecosystems where a missing
 * version means something else.
 *
 * A correction, since this comment previously claimed otherwise: the original
 * justification was that a git devDependency "arrives versionless" and would
 * be deleted without clause 1. That is not npm's behaviour. Measured against
 * npm 11: a git dependency is locked with a real version, and a `file:` link
 * does yield a versionless entry but never acquires a dependant — syft
 * attaches the dependency edge to the versioned entry — so it is not a
 * candidate either. The shape that demonstration relied on came from a
 * hand-written lockfile, not from npm. Clause 1 stands on the Go/npm
 * asymmetry above, which is verified; it does not stand on a deletion risk
 * anyone has reproduced. (review of #182)
 *
 * **Only a sole graph root is lifted.** Lifting every match deletes vendored
 * third-party Go modules: a monorepo, a vendored source tree, or any scan that
 * reaches someone else's checked-in `go.mod` yields several versionless main
 * modules, and they are real components of the artifact. The argument for
 * lift-all was that each match is independently established as a
 * non-component; a vendored module falsifies it. This now mirrors
 * findDocumentRootId, which refuses to lift when several packages are
 * DESCRIBED for the same reason. (review of #176)
 *
 * Structural on purpose. No match on package name, on syft's SPDXID prefixes,
 * on `sourceInfo` wording, or on `primaryPackagePurpose` (absent in 2.2) — all
 * generator-specific and liable to change without notice.
 */
function findGraphRoots(
  doc: SpdxDocument,
  listed: readonly SpdxPackage[],
): Set<SpdxPackage> {
  const empty = new Set<SpdxPackage>();
  const relationships = Array.isArray(doc.relationships)
    ? doc.relationships
    : [];
  const listedIds = new Set<string>();
  for (const p of listed) {
    if (typeof p.SPDXID === 'string') listedIds.add(p.SPDXID);
  }

  // One pass building two sets: a per-package scan of relationships[] would be
  // quadratic, and real documents are large (nl6 carries 3,514 dependency
  // edges against 1,421 packages; opennms-core is bigger still).
  //
  // SPDX states the same fact in either direction and generators pick either,
  // so both are consumed. Reading only DEPENDENCY_OF left `isDependency`
  // incomplete on a mixed document, which deleted a real component.
  const hasDependencies = new Set<string>();
  const isDependency = new Set<string>();
  for (const r of relationships) {
    if (!isRecord(r)) continue;
    const type =
      typeof r.relationshipType === 'string'
        ? r.relationshipType.toUpperCase()
        : '';
    const subject = typeof r.spdxElementId === 'string' ? r.spdxElementId : '';
    const object =
      typeof r.relatedSpdxElement === 'string' ? r.relatedSpdxElement : '';
    if (!subject || !object) continue;
    // `A DEPENDENCY_OF B` and `B DEPENDS_ON A` both mean "A is a dependency
    // of B". Normalize to (dependency, dependant).
    let dependency: string;
    let dependant: string;
    if (type === 'DEPENDENCY_OF') {
      dependency = subject;
      dependant = object;
    } else if (type === 'DEPENDS_ON') {
      dependency = object;
      dependant = subject;
    } else {
      continue;
    }
    // Being a dependency disqualifies unconditionally — the conservative
    // direction, since it keeps the package.
    isDependency.add(dependency);
    // Having a dependant only counts when the dependency is a package in this
    // document. A dangling id would otherwise make any versionless golang
    // package look like a graph root.
    //
    // This is also what stops the rule emptying the component list, so no
    // separate floor guard is needed: with one package listed, the only
    // dependency that could point at it is itself, and clause 4 rejects that.
    if (listedIds.has(dependency)) hasDependencies.add(dependant);
  }

  if (hasDependencies.size === 0) return empty;
  const roots: SpdxPackage[] = [];
  for (const p of listed) {
    const id = p.SPDXID;
    if (typeof id !== 'string') continue;
    if (!isGolangPackage(p)) continue;
    if (!hasNoUsableVersion(p.versionInfo)) continue;
    if (!hasDependencies.has(id)) continue;
    if (isDependency.has(id)) continue;
    roots.push(p);
  }
  // Several matches means the document describes several projects (a monorepo,
  // or vendored third-party source). Removing them would delete real data, so
  // remove nothing — the same call findDocumentRootId makes.
  return roots.length === 1 ? new Set(roots) : empty;
}

/** Purl type is `golang`. A package with no purl never qualifies: without an
 * ecosystem there is no basis for the versionless-root inference.
 *
 * Case-insensitive because the purl spec defines the type as case-insensitive.
 * syft writes it lowercase, but a stricter check would silently stop lifting
 * for a generator that does not — and the failure would look like the bug this
 * function exists to fix. */
function isGolangPackage(pkg: SpdxPackage): boolean {
  const purl = extractPurl(pkg);
  return purl !== null && purl.toLowerCase().startsWith('pkg:golang/');
}

/**
 * True when a package states no version this viewer can use: the field is
 * absent, empty, NOASSERTION, or UNKNOWN — the last being what syft writes for
 * a Go main module, because `go.mod` has no version field.
 *
 * Deliberately not folded into `isNoAssertion`: that helper also governs what
 * the components table displays, and "UNKNOWN" is a value a reader should keep
 * seeing when a package really is listed.
 *
 * A non-string value is malformed input, not evidence of a graph root, so it
 * returns false and the package is kept. Returning true would let
 * `versionInfo: 0` silently delete a component.
 *
 * `NONE` is deliberately absent. SPDX permits it, but it asserts "no version
 * exists" rather than "none was determined", and every extra accepted value
 * widens the set of components this rule can delete.
 */
function hasNoUsableVersion(versionInfo: unknown): boolean {
  if (versionInfo === undefined || versionInfo === null) return true;
  if (typeof versionInfo !== 'string') return false;
  const v = versionInfo.trim().toUpperCase();
  return v === '' || v === NOASSERTION || v === 'UNKNOWN';
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

/**
 * The package's purl, or null.
 *
 * `referenceType` is matched case-insensitively, for the same reason
 * `isGolangPackage` lowercases the purl type: the value is a spec-defined
 * keyword, not user data, and a generator writing `PURL` would otherwise lose
 * its purl, its group, and its originator fallback silently.
 *
 * Keeps scanning past a `purl` ref whose locator is empty. Returning null on
 * the first one would drop a valid locator later in the array.
 */
function extractPurl(pkg: SpdxPackage): string | null {
  const refs = Array.isArray(pkg.externalRefs) ? pkg.externalRefs : [];
  for (const ref of refs) {
    if (!ref || typeof ref.referenceType !== 'string') continue;
    if (ref.referenceType.toLowerCase() !== 'purl') continue;
    const locator = emptyToNull(ref.referenceLocator);
    if (locator !== null) return locator;
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
