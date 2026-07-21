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

export const NOASSERTION = 'NOASSERTION';

export function isNoAssertion(v: string | undefined | null): boolean {
  if (!v) return true;
  const t = v.trim();
  return t.length === 0 || t === NOASSERTION;
}
