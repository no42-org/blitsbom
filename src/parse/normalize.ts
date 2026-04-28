import type {
  CdxBom,
  CdxComponent,
  CdxLicenseChoice,
  Component,
  License,
  LoadedSbom,
  SbomMetadata,
} from '../types';

export function normalizeBom(bom: CdxBom): LoadedSbom {
  const components = (bom.components ?? []).map(normalizeComponent);
  const metadata = normalizeMetadata(bom);
  return { metadata, components };
}

export function normalizeComponent(raw: CdxComponent): Component {
  return {
    type: raw.type,
    group: emptyToNull(raw.group),
    name: raw.name,
    version: emptyToNull(raw.version),
    description: emptyToNull(raw.description),
    publisher: emptyToNull(raw.publisher),
    scope: emptyToNull(raw.scope),
    purl: emptyToNull(raw.purl),
    licenses: (raw.licenses ?? []).map(normalizeLicense).filter(notNull),
  };
}

function normalizeLicense(choice: CdxLicenseChoice): License | null {
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

function normalizeMetadata(bom: CdxBom): SbomMetadata {
  return {
    projectName: bom.metadata?.component?.name ?? null,
    timestamp: bom.metadata?.timestamp ?? null,
    specVersion: bom.specVersion,
    vulnerabilityCount: Array.isArray(bom.vulnerabilities)
      ? bom.vulnerabilities.length
      : 0,
  };
}

function emptyToNull(v: string | undefined | null): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function notNull<T>(v: T | null): v is T {
  return v !== null;
}
