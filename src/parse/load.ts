import { isCdxBom, isSupportedSpecVersion } from './isCdxBom';
import { normalizeBom } from './normalize';
import { SUPPORTED_SPEC_VERSIONS, type LoadResult } from '../types';

export function parseSbomText(text: string): LoadResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: `File is not valid JSON: ${(err as Error).message}`,
    };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      ok: false,
      error: 'Top-level JSON value must be a CycloneDX SBOM object.',
    };
  }

  const obj = value as Record<string, unknown>;

  if (obj.bomFormat !== 'CycloneDX') {
    return {
      ok: false,
      error:
        'Only CycloneDX SBOMs are supported in v1. Expected `"bomFormat": "CycloneDX"`.',
    };
  }

  if (typeof obj.specVersion !== 'string') {
    return { ok: false, error: 'Missing CycloneDX `specVersion` field.' };
  }

  if (!isSupportedSpecVersion(obj.specVersion)) {
    return {
      ok: false,
      error: `CycloneDX ${obj.specVersion} is not supported. Supported versions: ${SUPPORTED_SPEC_VERSIONS.join(', ')}.`,
    };
  }

  if (!isCdxBom(obj)) {
    return {
      ok: false,
      error: 'Document does not look like a CycloneDX SBOM.',
    };
  }

  return { ok: true, sbom: normalizeBom(obj) };
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        resolve(result);
      } else {
        reject(new Error('FileReader returned unexpected non-string result'));
      }
    };
    reader.readAsText(file);
  });
}

export async function loadSbomFile(file: File): Promise<LoadResult> {
  let text: string;
  try {
    text = await readFileAsText(file);
  } catch (err) {
    return { ok: false, error: `Could not read file: ${(err as Error).message}` };
  }
  return parseSbomText(text);
}
