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
  return {
    type: raw.type,
    group: emptyToNull(raw.group),
    name: raw.name,
    version: emptyToNull(raw.version),
    description: emptyToNull(raw.description),
    publisher: emptyToNull(raw.publisher),
    scope: emptyToNull(raw.scope),
    purl: emptyToNull(raw.purl),
    licenses: (raw.licenses ?? []).map(normalizeCdxLicense).filter(notNull),
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
      const license: License = { kind: 'id', value: lic.id.trim() };
      if (lic.url) license.url = lic.url;
      return license;
    }
    if (typeof lic.name === 'string' && lic.name.trim()) {
      const license: License = { kind: 'name', value: lic.name.trim() };
      if (lic.url) license.url = lic.url;
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
