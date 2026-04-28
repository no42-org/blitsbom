import {
  type CdxBom,
  type CdxSpecVersion,
  SUPPORTED_SPEC_VERSIONS,
} from '../types';

export function isCdxBom(value: unknown): value is CdxBom {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (v.bomFormat !== 'CycloneDX') return false;
  if (typeof v.specVersion !== 'string') return false;
  if (!isSupportedSpecVersion(v.specVersion)) return false;
  if (v.components !== undefined && !Array.isArray(v.components)) return false;
  return true;
}

export function isSupportedSpecVersion(v: string): v is CdxSpecVersion {
  return (SUPPORTED_SPEC_VERSIONS as readonly string[]).includes(v);
}
