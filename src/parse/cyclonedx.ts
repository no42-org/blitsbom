import type {
  CdxBom,
  CdxComponent,
  CdxLicenseChoice,
  Component,
  License,
  LoadedSbom,
  SbomMetadata,
} from '../types';
import { SUPPORTED_CDX_VERSIONS } from '../types';
import { emptyToNull, notNull } from './util';
import { normalizeLicenseValue } from './licenseValue';
import { canonicalizePurl } from './purlMatch';

export function isCdxBom(value: unknown): value is CdxBom {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.bomFormat !== 'CycloneDX') return false;
  if (typeof v.specVersion !== 'string') return false;
  if (!isSupportedCdxVersion(v.specVersion)) return false;
  if (v.components !== undefined && !Array.isArray(v.components)) return false;
  return true;
}

export function isSupportedCdxVersion(v: string): boolean {
  return (SUPPORTED_CDX_VERSIONS as readonly string[]).includes(v);
}

export function normalizeCdxBom(bom: CdxBom): LoadedSbom {
  const components = (bom.components ?? []).map(normalizeCdxComponent);
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
    // CycloneDX 1.4–1.6 doesn't have a distinct "originator" field; mirror
    // `publisher` so the originator donut works uniformly across formats.
    originator: publisher,
    scope: emptyToNull(raw.scope),
    purl,
    purlCanonical: canonicalizePurl(purl),
    bomRef: emptyToNull(raw['bom-ref']),
    licenses: (raw.licenses ?? []).map(normalizeCdxLicense).filter(notNull),
    vulnerabilities: [],
  };
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
    timestamp: bom.metadata?.timestamp ?? null,
    specVersion: bom.specVersion,
    sbomFormat: 'CycloneDX-1.x',
    vulnerabilityCount: Array.isArray(bom.vulnerabilities)
      ? bom.vulnerabilities.length
      : 0,
  };
}
