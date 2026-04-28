export type DetectedFormat = 'cyclonedx' | 'spdx' | 'unknown';

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
