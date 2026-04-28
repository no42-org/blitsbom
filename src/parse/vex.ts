/**
 * VEX (Vulnerability Exploitability eXchange) parser for CycloneDX 1.4+
 * `vulnerabilities[]` arrays. Normalizes raw CDX vulnerability records
 * into the internal `Vulnerability` shape and joins them to a loaded
 * SBOM by canonicalized purl, with bom-ref as a fallback key.
 */

import type {
  CdxVulnerability,
  CdxRating,
  Component,
  LoadedSbom,
  Severity,
  Vulnerability,
  VexStatus,
} from '../types';
import { canonicalizePurl } from './purlMatch';

const SEVERITY_ORDER: Record<Severity, number> = {
  none: 0,
  unknown: 1,
  low: 2,
  medium: 3,
  high: 4,
  critical: 5,
};

const VALID_VEX_STATES = new Set<VexStatus>([
  'exploitable',
  'in_triage',
  'not_affected',
  'false_positive',
  'resolved',
  'resolved_with_pedigree',
]);

/** States whose vulnerabilities are hidden from default-visibility surfaces
 * (table badge, summary count). They remain in the data model and can be
 * revealed via the "Show suppressed" toggle. */
const SUPPRESSED_STATES = new Set<VexStatus>([
  'not_affected',
  'false_positive',
  'resolved',
  'resolved_with_pedigree',
]);

/** Default-visibility predicate per the design.md visibility table. */
export function isLive(v: Vulnerability): boolean {
  if (!v.status) return true;
  return !SUPPRESSED_STATES.has(v.status);
}

/** The most severe rating across a vulnerability set, matching the visual
 * ordering used by the table badge color. Returns `'none'` for an empty
 * input so callers can use it as the component's "primary severity". */
export function worstSeverityOf(
  vulns: readonly Vulnerability[],
): Severity {
  let best: Severity = 'none';
  for (const v of vulns) {
    if (SEVERITY_ORDER[v.severity] > SEVERITY_ORDER[best]) best = v.severity;
  }
  return best;
}

/** Pick the most severe rating across an array of CDX ratings, preferring
 * a CVSSv3 (or v3.1) score for the canonical numeric score when one is
 * available. Collapses CDX `info` to internal `low`. */
export function pickSeverityAndScore(ratings: CdxRating[] | undefined): {
  severity: Severity;
  cvssScore?: number;
  cvssVector?: string;
} {
  if (!Array.isArray(ratings) || ratings.length === 0) {
    return { severity: 'unknown' };
  }
  let bestSev: Severity = 'unknown';
  for (const r of ratings) {
    const s = normalizeSeverity(r.severity);
    if (SEVERITY_ORDER[s] > SEVERITY_ORDER[bestSev]) bestSev = s;
  }
  // Score / vector: prefer CVSSv3* ratings, then any rating that has a
  // numeric score, in order of appearance.
  const v3 = ratings.find(
    (r) =>
      typeof r.score === 'number' &&
      typeof r.method === 'string' &&
      /CVSSv3/i.test(r.method),
  );
  const anyScored = v3 ?? ratings.find((r) => typeof r.score === 'number');
  return {
    severity: bestSev,
    ...(anyScored?.score !== undefined ? { cvssScore: anyScored.score } : {}),
    ...(anyScored?.vector ? { cvssVector: anyScored.vector } : {}),
  };
}

function normalizeSeverity(raw: CdxRating['severity']): Severity {
  if (typeof raw !== 'string') return 'unknown';
  const v = raw.toLowerCase().trim();
  if (v === 'info') return 'low';
  if (
    v === 'none' ||
    v === 'low' ||
    v === 'medium' ||
    v === 'high' ||
    v === 'critical'
  ) {
    return v as Severity;
  }
  return 'unknown';
}

function normalizeStatus(state: string | undefined): VexStatus | undefined {
  if (typeof state !== 'string') return undefined;
  const v = state.toLowerCase().trim() as VexStatus;
  return VALID_VEX_STATES.has(v) ? v : undefined;
}

function pickAdvisoryUrl(raw: CdxVulnerability): string | undefined {
  const sourceUrl = raw.source?.url;
  if (typeof sourceUrl === 'string' && sourceUrl.trim()) return sourceUrl;
  const adv = raw.advisories?.find(
    (a) => typeof a?.url === 'string' && a.url.trim(),
  );
  return adv?.url;
}

/** Normalize a single CDX vulnerability record. Returns null if the record
 * has no usable id (we keep it lenient — a vuln without an id can't be
 * displayed meaningfully). */
export function normalizeCdxVulnerability(
  raw: CdxVulnerability,
): Vulnerability | null {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!id) return null;
  const { severity, cvssScore, cvssVector } = pickSeverityAndScore(raw.ratings);
  const v: Vulnerability = {
    id,
    source:
      typeof raw.source?.name === 'string' && raw.source.name.trim()
        ? raw.source.name.trim()
        : 'unknown',
    severity,
  };
  if (cvssScore !== undefined) v.cvssScore = cvssScore;
  if (cvssVector) v.cvssVector = cvssVector;
  if (typeof raw.description === 'string' && raw.description.trim()) {
    v.description = raw.description.trim();
  }
  const url = pickAdvisoryUrl(raw);
  if (url) v.url = url;
  const status = normalizeStatus(raw.analysis?.state);
  if (status) v.status = status;
  if (
    typeof raw.analysis?.justification === 'string' &&
    raw.analysis.justification.trim()
  ) {
    v.justification = raw.analysis.justification.trim();
  }
  return v;
}

export function normalizeCdxVulnerabilities(
  raws: CdxVulnerability[] | undefined,
): Vulnerability[] {
  if (!Array.isArray(raws)) return [];
  const out: Vulnerability[] = [];
  for (const raw of raws) {
    const v = normalizeCdxVulnerability(raw);
    if (v) out.push(v);
  }
  return out;
}

export interface ApplyVexResult {
  /** A new LoadedSbom with vulnerabilities joined onto components and a
   * `vexMetadata` block describing the merge. */
  sbom: LoadedSbom;
  /** Number of raw vulnerabilities whose `affects[].ref` did not match any
   * component (by canonical purl or bom-ref). Surfaced as a UI hint. */
  unmatched: number;
}

/** Build a fresh LoadedSbom that has the given raw VEX vulnerabilities
 * joined onto the existing components. Components without matches keep
 * their (empty) vulnerabilities array. The original LoadedSbom is not
 * mutated. */
export function applyVexToSbom(
  sbom: LoadedSbom,
  rawVulns: CdxVulnerability[] | undefined,
  sourceFilename: string,
  sourceTimestamp: string | null,
): ApplyVexResult {
  const raws = Array.isArray(rawVulns) ? rawVulns : [];

  // Build component lookups once.
  const byPurl = new Map<string, Component[]>();
  const byBomRef = new Map<string, Component[]>();

  // Fresh component clones so the merge doesn't share `.vulnerabilities`
  // arrays with the input SBOM (immutability).
  const components: Component[] = sbom.components.map((c) => ({
    ...c,
    vulnerabilities: [],
  }));

  for (const c of components) {
    if (c.purlCanonical) {
      const arr = byPurl.get(c.purlCanonical) ?? [];
      arr.push(c);
      byPurl.set(c.purlCanonical, arr);
    }
    if (c.bomRef) {
      const arr = byBomRef.get(c.bomRef) ?? [];
      arr.push(c);
      byBomRef.set(c.bomRef, arr);
    }
  }

  let unmatched = 0;
  let suppressed = 0;
  for (const raw of raws) {
    const v = normalizeCdxVulnerability(raw);
    if (!v) continue;
    if (v.status && SUPPRESSED_STATES.has(v.status)) suppressed += 1;

    const affects = Array.isArray(raw.affects) ? raw.affects : [];
    let matchedAny = false;
    for (const aff of affects) {
      const ref = typeof aff?.ref === 'string' ? aff.ref.trim() : '';
      if (!ref) continue;
      const canonical = canonicalizePurl(ref);
      const targets = (canonical && byPurl.get(canonical)) ?? byBomRef.get(ref);
      if (!targets || targets.length === 0) continue;
      matchedAny = true;
      for (const c of targets) {
        c.vulnerabilities.push(v);
      }
    }
    if (!matchedAny) unmatched += 1;
  }

  const merged: LoadedSbom = {
    metadata: sbom.metadata,
    components,
    vexMetadata: {
      timestamp: sourceTimestamp,
      sourceFilename,
      totalVulns: raws.length,
      suppressedByStatus: suppressed,
      unmatched,
    },
  };

  return { sbom: merged, unmatched };
}
