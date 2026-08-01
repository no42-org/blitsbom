export type DetectedFormat = 'cyclonedx' | 'spdx' | 'unknown';

/**
 * Any SPDX 2.x minor, recognized or not — the same "known major, unknown minor
 * tolerated" policy the CycloneDX gate adopted in #171.
 *
 * Deliberately *without* CycloneDX's verified-ceiling qualifier (#175, the
 * "newer than this build" marker). That exists because CycloneDX 1.x is a live,
 * additive line: 1.7 shipped and 1.8 will follow, so the difference between
 * "checked" and "assumed" is a real thing to tell a reader. SPDX 2.x is closed
 * — 2.3 (2022) was the last, superseded by 3.0 (2024) — so a ceiling here would
 * guard a version that cannot ship.
 *
 * The asymmetry is therefore a consequence of the two ecosystems being in
 * different states, not an inconsistency to fix. If SPDX 3.x support is ever
 * added it is a new major with a different serialization, and the question
 * reopens on its own terms.
 */
const SPDX_VERSION_RE = /^SPDX-2\.[0-9]+$/;

export function detectFormat(value: unknown): DetectedFormat {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'unknown';
  }
  const obj = value as Record<string, unknown>;
  if (obj.bomFormat === 'CycloneDX' && typeof obj.specVersion === 'string') {
    return 'cyclonedx';
  }
  if (
    typeof obj.spdxVersion === 'string' &&
    SPDX_VERSION_RE.test(obj.spdxVersion)
  ) {
    return 'spdx';
  }
  return 'unknown';
}
