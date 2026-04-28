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
  vulnerabilities?: unknown[];
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
  scope: string | null;
  purl: string | null;
  licenses: License[];
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
