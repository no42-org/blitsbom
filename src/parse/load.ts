import { detectFormat } from './format-detect';
import { isCdxBom, normalizeCdxBom } from './cyclonedx';
import { isSpdxDocument, normalizeSpdxDocument } from './spdx';
import { SUPPORTED_CDX_VERSIONS, type LoadResult } from '../types';

export interface LoadCallbacks {
  onReadProgress?: (loaded: number, total: number) => void;
  onParseStart?: () => void;
}

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

  const format = detectFormat(value);

  if (format === 'cyclonedx') {
    if (isCdxBom(value)) {
      return { ok: true, sbom: normalizeCdxBom(value) };
    }
    // Got a CycloneDX-shaped doc but not a supported version (1.0–1.3).
    const obj = value as Record<string, unknown>;
    return {
      ok: false,
      error: `CycloneDX ${obj.specVersion} is not supported. Supported CycloneDX versions: ${SUPPORTED_CDX_VERSIONS.join(', ')}.`,
    };
  }

  if (format === 'spdx') {
    if (isSpdxDocument(value)) {
      return { ok: true, sbom: normalizeSpdxDocument(value) };
    }
    return { ok: false, error: 'SPDX document failed structural validation.' };
  }

  return {
    ok: false,
    error:
      'Unrecognized format. blitsbom supports CycloneDX 1.4–1.6 and SPDX 2.x JSON SBOMs.',
  };
}

export function readFileAsText(
  file: File,
  onReadProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Read error'));
    reader.onprogress = (event: ProgressEvent<FileReader>) => {
      if (onReadProgress && event.lengthComputable) {
        onReadProgress(event.loaded, event.total);
      }
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        if (onReadProgress) onReadProgress(file.size, file.size);
        resolve(result);
      } else {
        reject(new Error('FileReader returned unexpected non-string result'));
      }
    };
    reader.readAsText(file);
  });
}

export async function loadSbomFile(
  file: File,
  callbacks: LoadCallbacks = {},
): Promise<LoadResult> {
  let text: string;
  try {
    text = await readFileAsText(file, callbacks.onReadProgress);
  } catch (err) {
    return { ok: false, error: `Could not read file: ${(err as Error).message}` };
  }

  if (callbacks.onParseStart) {
    callbacks.onParseStart();
    // Yield to the browser so the "Parsing…" message paints before the
    // synchronous JSON.parse + normalize blocks the main thread. Use
    // setTimeout(0) over requestAnimationFrame because headless browsers
    // can heavily throttle rAF when no compositor is active.
    await new Promise((resolve) => setTimeout(() => resolve(null), 0));
  }

  return parseSbomText(text);
}
