import type {
  CdxBom,
  CdxComponent,
  CdxLicenseChoice,
  CdxToolComponent,
  CdxToolsObject,
  Component,
  License,
  LoadedSbom,
  SbomMetadata,
} from '../types';
import { CDX_SUPPORTED_MAJOR, CDX_MINIMUM_MINOR } from '../types';
import { emptyToNull, notNull, isRecord, isNoAssertion } from './util';
import { normalizeLicenseValue } from './licenseValue';
import { canonicalizePurl, originatorFromPurl } from './purlMatch';

export function isCdxBom(value: unknown): value is CdxBom {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.bomFormat !== 'CycloneDX') return false;
  if (typeof v.specVersion !== 'string') return false;
  if (!isSupportedCdxVersion(v.specVersion)) return false;
  if (v.components !== undefined && !Array.isArray(v.components)) return false;
  return true;
}

/**
 * Accept any minor at or above the floor within the supported major, including
 * minors this build has never heard of.
 *
 * An enumerated allowlist meant every CycloneDX release broke the viewer until
 * someone edited a constant — syft 1.46 emits 1.7, and a current-syft SBOM
 * could not be opened at all. The SPDX side already worked this way
 * (`/^SPDX-2\.[0-9]+$/` in format-detect.ts), so this is the two parsers
 * agreeing rather than a new policy. (#171)
 *
 * Compared numerically, not lexically: "1.10" is later than "1.4", and a
 * string comparison would get that backwards.
 */
export function isSupportedCdxVersion(v: string): boolean {
  const parts = v.split('.');
  if (parts.length !== 2) return false;
  // Reject "1.4.0", "v1.5", "1.x", " 1.5" and friends: Number() is too
  // permissive (it accepts whitespace and "0x..."), so require plain digits.
  if (!/^\d+$/.test(parts[0]!) || !/^\d+$/.test(parts[1]!)) return false;
  return (
    Number(parts[0]) === CDX_SUPPORTED_MAJOR &&
    Number(parts[1]) >= CDX_MINIMUM_MINOR
  );
}

export function normalizeCdxBom(bom: CdxBom): LoadedSbom {
  // Drop non-object entries rather than throwing: `components: [null]` is
  // valid JSON, and a viewer should render the components it can read rather
  // than fail the whole file over one bad element.
  const components = (bom.components ?? [])
    .filter((c): c is CdxComponent => isRecord(c))
    .map(normalizeCdxComponent);
  const metadata = normalizeCdxMetadata(bom);
  return { metadata, components };
}

export function normalizeCdxComponent(raw: CdxComponent): Component {
  const publisher = emptyToNull(raw.publisher);
  const purl = emptyToNull(raw.purl);
  return {
    type: raw.type,
    group: emptyToNull(raw.group),
    name: raw.name,
    version: emptyToNull(raw.version),
    description: emptyToNull(raw.description),
    publisher,
    originator: deriveOriginator(raw),
    scope: emptyToNull(raw.scope),
    purl,
    purlCanonical: canonicalizePurl(purl),
    bomRef: emptyToNull(raw['bom-ref']),
    licenses: (raw.licenses ?? []).map(normalizeCdxLicense).filter(notNull),
    vulnerabilities: [],
  };
}

/**
 * "Who does this component come from?" for the originator rollup. CycloneDX
 * has no originator field, so take the first declared answer:
 *
 *   publisher → supplier.name → manufacturer.name (1.6) → authors[0].name (1.6)
 *   or the deprecated `author` string (≤1.5) → group → the purl namespace.
 *
 * Every tier skips NOASSERTION, not just empties: SPDX→CycloneDX converters
 * inject NOASSERTION into exactly these fields, and a converted
 * `publisher: "NOASSERTION"` must not shadow a real supplier below it. (#144)
 *
 * The last two tiers exist because a syft CycloneDX scan has the same gap its
 * SPDX scan has: nothing declares an origin, while `group` says
 * `com.google.guava` right there. `group` comes first because it is that fact
 * declared directly, and a component can carry it with no purl at all. (#169)
 */
function deriveOriginator(raw: CdxComponent): string | null {
  const candidates = [
    raw.publisher,
    isRecord(raw.supplier) ? raw.supplier.name : undefined,
    isRecord(raw.manufacturer) ? raw.manufacturer.name : undefined,
    Array.isArray(raw.authors) && isRecord(raw.authors[0])
      ? raw.authors[0].name
      : stripContactSuffix(raw.author),
    raw.group,
    originatorFromPurl(emptyToNull(raw.purl)),
  ];
  for (const c of candidates) {
    if (typeof c !== 'string') continue;
    const v = c.trim();
    if (!isNoAssertion(v)) return v;
  }
  return null;
}

/**
 * The deprecated ≤1.5 `author` field carries raw npm-style
 * "Name <email> (url)" strings, while 1.6 `authors` contacts already separate
 * name from email — strip the suffixes so the same person produces the same
 * grouping key regardless of which spec version declared them.
 */
function stripContactSuffix(author: unknown): string | undefined {
  if (typeof author !== 'string') return undefined;
  // Truncate at the first delimiter rather than deleting <...> segments:
  // the name always leads in the npm convention, and a deletion-based
  // rewrite trips CodeQL's incomplete-sanitization heuristic (this is a
  // grouping key, not HTML sanitization — rendering is escaped by Svelte).
  return (author.match(/^[^<(]*/)?.[0] ?? '').trim();
}

function normalizeCdxLicense(choice: CdxLicenseChoice): License | null {
  if ('expression' in choice && typeof choice.expression === 'string') {
    const value = choice.expression.trim();
    if (!value) return null;
    return { kind: 'expression', value };
  }
  if ('license' in choice && choice.license) {
    const lic = choice.license;
    if (typeof lic.id === 'string' && lic.id.trim()) {
      const norm = normalizeLicenseValue(lic.id);
      if (!norm.value) return null;
      const license: License = { kind: 'id', value: norm.value };
      const url = lic.url ?? norm.url;
      if (url) license.url = url;
      return license;
    }
    if (typeof lic.name === 'string' && lic.name.trim()) {
      const norm = normalizeLicenseValue(lic.name);
      if (!norm.value) return null;
      const license: License = { kind: 'name', value: norm.value };
      const url = lic.url ?? norm.url;
      if (url) license.url = url;
      return license;
    }
  }
  return null;
}

function normalizeCdxMetadata(bom: CdxBom): SbomMetadata {
  return {
    projectName: bom.metadata?.component?.name ?? null,
    productVersion: emptyToNull(bom.metadata?.component?.version),
    timestamp: bom.metadata?.timestamp ?? null,
    specVersion: bom.specVersion,
    sbomFormat: 'CycloneDX-1.x',
    sbomTool: extractCdxTool(bom.metadata?.tools),
    vulnerabilityCount: Array.isArray(bom.vulnerabilities)
      ? bom.vulnerabilities.length
      : 0,
  };
}

/**
 * Identify the tool that produced the SBOM from `metadata.tools`, which has
 * two shapes across the supported spec range:
 *
 *   1.4  array form:   `tools: [{ vendor, name, version }, …]`
 *   1.5+ object form:  `tools: { components: [{ name, version }, …], … }`
 *
 * Returns a `"name version"` (optionally `"vendor name version"`) string for
 * the first usable entry, or null when none identifies a tool.
 */
function extractCdxTool(
  tools: CdxToolComponent[] | CdxToolsObject | undefined,
): string | null {
  if (!tools) return null;
  const list: CdxToolComponent[] = Array.isArray(tools)
    ? tools
    : Array.isArray(tools.components)
      ? tools.components
      : [];
  for (const t of list) {
    if (!isRecord(t)) continue;
    const label = formatToolLabel(t);
    if (label) return label;
  }
  return null;
}

function formatToolLabel(t: CdxToolComponent): string | null {
  const name = emptyToNull(t.name);
  if (!name) return null;
  const vendor = emptyToNull(t.vendor);
  const version = emptyToNull(t.version);
  return [vendor, name, version].filter(notNull).join(' ');
}
