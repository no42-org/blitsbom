export function emptyToNull(v: string | undefined | null): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function notNull<T>(v: T | null): v is T {
  return v !== null;
}

export const NOASSERTION = 'NOASSERTION';

export function isNoAssertion(v: string | undefined | null): boolean {
  if (!v) return true;
  const t = v.trim();
  return t.length === 0 || t === NOASSERTION;
}
