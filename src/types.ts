// CycloneDX raw shapes (subset relevant to v1).

export type CdxSpecVersion = '1.4' | '1.5' | '1.6';

export const SUPPORTED_CDX_VERSIONS: readonly CdxSpecVersion[] = [
  '1.4',
  '1.5',
  '1.6',
] as const;

export interface CdxLicenseObject {
  id?: string;
  name?: string;
  url?: string;
}

export interface CdxLicenseChoiceLicense {
  license: CdxLicenseObject;
}

export interface CdxLicenseChoiceExpression {
  expression: string;
}

export type CdxLicenseChoice =
  | CdxLicenseChoiceLicense
  | CdxLicenseChoiceExpression;

export interface CdxExternalReference {
  type: string;
  url: string;
  comment?: string;
}

export interface CdxHash {
  alg: string;
  content: string;
}

export interface CdxComponent {
  type: string;
  'bom-ref'?: string;
  group?: string;
  name: string;
  version?: string;
  description?: string;
  publisher?: string;
  scope?: string;
  purl?: string;
  licenses?: CdxLicenseChoice[];
  externalReferences?: CdxExternalReference[];
  hashes?: CdxHash[];
}

export interface CdxMetadataComponent {
  type?: string;
  name?: string;
  version?: string;
}

export interface CdxMetadata {
  timestamp?: string;
  component?: CdxMetadataComponent;
}

export interface CdxBom {
  bomFormat: 'CycloneDX';
  specVersion: CdxSpecVersion;
  serialNumber?: string;
  version?: number;
  metadata?: CdxMetadata;
  components?: CdxComponent[];
  dependencies?: unknown[];
  vulnerabilities?: CdxVulnerability[];
}

// CycloneDX 1.4+ vulnerability + VEX shapes (subset relevant to v1).
export interface CdxVulnerabilitySource {
  name?: string;
  url?: string;
}

export interface CdxRating {
  source?: CdxVulnerabilitySource;
  score?: number;
  severity?: 'none' | 'info' | 'low' | 'medium' | 'high' | 'critical' | 'unknown';
  method?: 'CVSSv2' | 'CVSSv3' | 'CVSSv31' | 'CVSSv4' | 'OWASP' | 'other' | string;
  vector?: string;
  justification?: string;
}

export interface CdxVexAffects {
  ref: string;
  versions?: { version?: string; range?: string; status?: string }[];
}

export interface CdxVexAnalysis {
  state?:
    | 'resolved'
    | 'resolved_with_pedigree'
    | 'exploitable'
    | 'in_triage'
    | 'false_positive'
    | 'not_affected'
    | string;
  justification?: string;
  detail?: string;
  response?: string[];
}

export interface CdxVulnerability {
  'bom-ref'?: string;
  id?: string;
  source?: CdxVulnerabilitySource;
  ratings?: CdxRating[];
  description?: string;
  detail?: string;
  recommendation?: string;
  advisories?: { url?: string; title?: string }[];
  affects?: CdxVexAffects[];
  analysis?: CdxVexAnalysis;
  published?: string;
  updated?: string;
}

// SPDX 2.x raw shapes (subset relevant to v1).

export interface SpdxExternalRef {
  referenceCategory?: string;
  referenceType?: string;
  referenceLocator?: string;
}

export interface SpdxPackage {
  SPDXID?: string;
  name: string;
  versionInfo?: string;
  supplier?: string;
  originator?: string;
  licenseConcluded?: string;
  licenseDeclared?: string;
  externalRefs?: SpdxExternalRef[];
  primaryPackagePurpose?: string;
}

export interface SpdxExtractedLicensingInfo {
  licenseId: string;
  name?: string;
  extractedText?: string;
  seeAlsos?: string[];
}

export interface SpdxCreationInfo {
  created?: string;
  creators?: string[];
}

export interface SpdxDocument {
  spdxVersion: string;
  dataLicense?: string;
  SPDXID?: string;
  name?: string;
  documentNamespace?: string;
  creationInfo?: SpdxCreationInfo;
  packages?: SpdxPackage[];
  files?: unknown[];
  hasExtractedLicensingInfos?: SpdxExtractedLicensingInfo[];
  relationships?: unknown[];
}

// Internal normalized model.

export type SbomFormat = 'CycloneDX-1.x' | 'SPDX-2.x';

export type LicenseKind = 'id' | 'name' | 'expression';

export interface License {
  kind: LicenseKind;
  /** SPDX id, free-form name, or verbatim SPDX expression */
  value: string;
  url?: string;
}

export interface Component {
  type: string;
  group: string | null;
  name: string;
  version: string | null;
  description: string | null;
  publisher: string | null;
  /** Originating organization or person — SPDX `originator` (preferred)
   * falling back to `supplier`; for CycloneDX, mirrors `publisher`. */
  originator: string | null;
  scope: string | null;
  purl: string | null;
  /** Canonicalized purl used for VEX joins; preserves the original `purl`
   * while supporting tolerant matching. Null when no purl. */
  purlCanonical: string | null;
  /** CycloneDX `bom-ref` if present; secondary key for VEX joins. */
  bomRef: string | null;
  licenses: License[];
  /** Vulnerabilities attached to this component via a loaded VEX. Empty
   * by default; never null. Populated only when a VEX has been loaded. */
  vulnerabilities: Vulnerability[];
}

// VEX / vulnerability internal model.
export type Severity =
  | 'none'
  | 'low'
  | 'medium'
  | 'high'
  | 'critical'
  | 'unknown';

export type VexStatus =
  | 'exploitable'
  | 'in_triage'
  | 'not_affected'
  | 'false_positive'
  | 'resolved'
  | 'resolved_with_pedigree';

export interface Vulnerability {
  /** Identifier (CVE-…, GHSA-…, vendor advisory id, …) */
  id: string;
  /** Source name (e.g. NVD, GHSA, OSV, vendor) */
  source: string;
  severity: Severity;
  cvssScore?: number;
  cvssVector?: string;
  description?: string;
  url?: string;
  /** Normalized VEX `analysis.state`; absent for plain CDX vulns
   * without an analysis section. */
  status?: VexStatus;
  /** VEX `analysis.justification` (free-form). */
  justification?: string;
}

export interface VexMetadata {
  /** VEX document timestamp, when present. */
  timestamp: string | null;
  /** User-facing source filename of the dropped VEX file. */
  sourceFilename: string;
  /** Total raw vulnerability records loaded from the VEX. */
  totalVulns: number;
  /** Vulnerabilities suppressed by VEX `analysis.state` (default-hidden). */
  suppressedByStatus: number;
  /** Vulnerabilities whose `affects[].ref` could not be matched to any
   * component in the loaded SBOM. Surfaced as a hint, not an error. */
  unmatched: number;
}

export interface SbomMetadata {
  projectName: string | null;
  timestamp: string | null;
  /** Concrete spec version string, e.g., "1.6" or "SPDX-2.3" */
  specVersion: string;
  sbomFormat: SbomFormat;
  vulnerabilityCount: number;
}

export interface LoadedSbom {
  metadata: SbomMetadata;
  components: Component[];
  /** Provenance + counts for a loaded VEX, when one has been merged in.
   * Absent when the SBOM is loaded without a VEX. */
  vexMetadata?: VexMetadata;
}

export type LoadResult =
  | { ok: true; sbom: LoadedSbom }
  | { ok: false; error: string };

// License classification.

export type LicenseCategory =
  | 'undeclared'
  | 'public-domain'
  | 'permissive'
  | 'copyleft'
  | 'strong-copyleft'
  | 'unrecognized'
  | 'proprietary';
