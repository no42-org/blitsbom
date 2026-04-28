/**
 * Strip parse-time artifacts from a license value and lift the embedded
 * URL (if any) out as a separate field. Handles three known patterns:
 *
 *   "BSD-3-Clause;link=https://asm.ow2.io/LICENSE.txt" → value "BSD-3-Clause", url "https://…"
 *   "\"Apache-2.0\""                                    → value "Apache-2.0"
 *   "GPLv2+ with classpath"                             → value "GPLv2+"
 *
 * Applied at parse time so downstream display, filtering, drilldown, and
 * CSV all see canonical license ids — and so two components carrying the
 * same license but different ;link URLs still bucket together.
 */
export interface NormalizedLicenseValue {
  value: string;
  url: string | null;
}

export function normalizeLicenseValue(raw: string): NormalizedLicenseValue {
  let v = (raw ?? '').trim();
  let url: string | null = null;

  // 1. ";link=URL" suffix (OpenNMS encoding). The URL may itself be quoted.
  const linkMatch = v.match(/;\s*link\s*=\s*"?([^"]*)"?\s*$/i);
  if (linkMatch) {
    const captured = linkMatch[1]?.trim() ?? '';
    if (captured.length > 0) url = captured;
    v = v.slice(0, linkMatch.index).trim();
  }

  // 2. Surrounding straight quotes.
  v = v.replace(/^["']|["']$/g, '').trim();

  // 3. "with <exception>" tail — v1 doesn't differentiate by exception,
  //    so the bare id is what we surface. Only strip when the head looks
  //    like a license id (no spaces) so we don't truncate prose names.
  const withMatch = v.match(/^(\S+)\s+with\s+\S/i);
  if (withMatch) {
    v = withMatch[1] ?? v;
  }

  return { value: v, url };
}
