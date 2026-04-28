import { detectFormat } from './format-detect';
import { isCdxBom, normalizeCdxBom } from './cyclonedx';
import { isSpdxDocument, normalizeSpdxDocument } from './spdx';
import { applyVexToSbom } from './vex';
import {
  SUPPORTED_CDX_VERSIONS,
  type CdxBom,
  type LoadedSbom,
  type LoadResult,
} from '../types';

export interface LoadCallbacks {
  onReadProgress?: (loaded: number, total: number) => void;
  onParseStart?: () => void;
}

/** Result of `parseDroppedFile`, distinguishing the three possible
 * outcomes when the user drops a file and an SBOM may already be loaded. */
export type ParseDroppedResult =
  | { kind: 'sbom'; sbom: LoadedSbom; unmatched?: number }
  | {
      kind: 'vex';
      sbom: LoadedSbom;
      unmatched: number;
    }
  | { kind: 'error'; error: string };

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
      const sbom = normalizeCdxBom(value);
      // Embedded-vulns flow: when a primary CDX has both components and a
      // non-empty vulnerabilities[] array, run the VEX merge against the
      // freshly-built SBOM so vulnerabilities attach to components.
      const raw = (value as CdxBom).vulnerabilities;
      if (Array.isArray(raw) && raw.length > 0 && sbom.components.length > 0) {
        const r = applyVexToSbom(
          sbom,
          raw,
          // Embedded vulns have no separate filename; use the SBOM's
          // self-describing label for provenance.
          sbom.metadata.projectName ?? 'embedded',
          sbom.metadata.timestamp,
        );
        return { ok: true, sbom: r.sbom };
      }
      return { ok: true, sbom };
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

/** Heuristic: a CDX document with a non-empty vulnerabilities[] AND
 * either zero components OR more vulnerabilities than components looks
 * like a VEX sidecar. Run only when an SBOM is already loaded. */
function looksLikeVex(value: CdxBom): boolean {
  const vulns = Array.isArray(value.vulnerabilities)
    ? value.vulnerabilities
    : [];
  if (vulns.length === 0) return false;
  const components = Array.isArray(value.components) ? value.components : [];
  return components.length === 0 || vulns.length > components.length;
}

/** Parse a dropped file against the current load state. When `currentSbom`
 * is null this behaves identically to `parseSbomText` (wrapped in the
 * tagged union); when non-null and the dropped file looks like a CDX VEX
 * sidecar, route through the VEX merge path instead of replacing. */
export function parseDroppedFile(
  text: string,
  currentSbom: LoadedSbom | null,
  filename: string,
): ParseDroppedResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return {
      kind: 'error',
      error: `File is not valid JSON: ${(err as Error).message}`,
    };
  }

  const format = detectFormat(value);

  // SPDX never classifies as VEX in v1; always treat as a primary SBOM.
  if (format === 'spdx') {
    if (isSpdxDocument(value)) {
      return { kind: 'sbom', sbom: normalizeSpdxDocument(value) };
    }
    return {
      kind: 'error',
      error: 'SPDX document failed structural validation.',
    };
  }

  if (format === 'cyclonedx') {
    if (!isCdxBom(value)) {
      const obj = value as Record<string, unknown>;
      return {
        kind: 'error',
        error: `CycloneDX ${obj.specVersion} is not supported. Supported CycloneDX versions: ${SUPPORTED_CDX_VERSIONS.join(', ')}.`,
      };
    }

    // Sidecar VEX path — only when an SBOM is already loaded.
    if (currentSbom && looksLikeVex(value)) {
      const r = applyVexToSbom(
        currentSbom,
        value.vulnerabilities,
        filename,
        value.metadata?.timestamp ?? null,
      );
      return { kind: 'vex', sbom: r.sbom, unmatched: r.unmatched };
    }

    // Primary SBOM (possibly with embedded vulns — handled in parseSbomText).
    const inner = parseSbomText(text);
    if (inner.ok) return { kind: 'sbom', sbom: inner.sbom };
    return { kind: 'error', error: inner.error };
  }

  // Unrecognized format. If an SBOM is loaded the user may have dropped a
  // VEX as their first file; surface that case clearly.
  if (!currentSbom) {
    return {
      kind: 'error',
      error:
        'Unrecognized format. blitsbom supports CycloneDX 1.4–1.6 and SPDX 2.x JSON SBOMs.',
    };
  }
  return {
    kind: 'error',
    error: 'Unrecognized format. Drop a CycloneDX VEX file (or another SBOM).',
  };
}

/** Helper for callers that need to surface a VEX-without-SBOM error
 * before any parse work runs (e.g. when policy is "first drop must be
 * SBOM"). The current heuristic delegates to parseDroppedFile which
 * returns 'sbom' for first-drop CDX even when it looks VEX-shaped — that
 * matches the spec scenario "first-drop CDX with embedded vulnerabilities". */
export function isVexWithoutSbomError(
  result: ParseDroppedResult,
  currentSbom: LoadedSbom | null,
): boolean {
  return (
    !currentSbom &&
    result.kind === 'error' &&
    /CycloneDX VEX/.test(result.error)
  );
}

/** Tighter return type for the forced-VEX path: never returns `kind:
 * 'sbom'`, so callers can narrow with a single `if/else`. */
export type ParseAsVexResult =
  | { kind: 'vex'; sbom: LoadedSbom; unmatched: number }
  | { kind: 'error'; error: string };

/** Forced-VEX path used by the "Load vulnerabilities (VEX)…" affordance.
 * Unlike `parseDroppedFile`, this NEVER treats the dropped document as a
 * replacement SBOM — the user has explicitly signaled "merge vulns into
 * the loaded SBOM" by clicking that button. Any `components[]` in the
 * dropped document are silently ignored; only its `vulnerabilities[]`
 * is consumed. */
export function parseAsVex(
  text: string,
  currentSbom: LoadedSbom,
  filename: string,
): ParseAsVexResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (err) {
    return {
      kind: 'error',
      error: `File is not valid JSON: ${(err as Error).message}`,
    };
  }

  const format = detectFormat(value);
  if (format === 'spdx') {
    return {
      kind: 'error',
      error:
        'SPDX 2.x has no first-class vulnerabilities concept. Drop a CycloneDX VEX (or a CycloneDX document with a vulnerabilities[] array).',
    };
  }
  if (format !== 'cyclonedx' || !isCdxBom(value)) {
    return {
      kind: 'error',
      error:
        'Unrecognized format. Expected a CycloneDX VEX (or a CycloneDX document containing a vulnerabilities[] array).',
    };
  }
  const vulns = Array.isArray(value.vulnerabilities) ? value.vulnerabilities : [];
  if (vulns.length === 0) {
    return {
      kind: 'error',
      error:
        'This CycloneDX file has no vulnerabilities[] array — nothing to merge as VEX.',
    };
  }
  const r = applyVexToSbom(
    currentSbom,
    vulns,
    filename,
    value.metadata?.timestamp ?? null,
  );
  return { kind: 'vex', sbom: r.sbom, unmatched: r.unmatched };
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
