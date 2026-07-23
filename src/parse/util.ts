export function emptyToNull(v: string | undefined | null): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function notNull<T>(v: T | null): v is T {
  return v !== null;
}

/** True for a plain object. Use to guard entries of arrays that came out of a
 * user-supplied file: `packages: [null]` and `components: ["x"]` are both
 * valid JSON, and the normalizers below assume object property access works.
 * Without this the first such entry throws a TypeError that escapes to the UI
 * as an unhandled rejection — a hostile SBOM could take the page down. */
export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Lowercase, filesystem-safe slug for filenames. Returns '' for input with no
 * usable characters, so callers supply their own fallback. Shared by the
 * browser download path and the node generator so both derive the same name. */
export function slugify(value: string, maxLen = 80): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen);
}

/** `<project>-<version>` slug used as the base of a report artifact filename,
 * falling back to 'sbom' when neither is known. Callers append the extension
 * (`.html` for the report, `.json` for the original-SBOM download). */
export function artifactBaseName(
  project: string | null | undefined,
  version: string | null | undefined,
): string {
  return slugify([project, version].filter(Boolean).join('-')) || 'sbom';
}

export const NOASSERTION = 'NOASSERTION';

export function isNoAssertion(v: string | undefined | null): boolean {
  if (!v) return true;
  const t = v.trim();
  return t.length === 0 || t === NOASSERTION;
}
