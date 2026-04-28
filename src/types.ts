// CycloneDX raw shapes (subset relevant to v1).

export type CdxSpecVersion = '1.4' | '1.5' | '1.6';

export const SUPPORTED_SPEC_VERSIONS: readonly CdxSpecVersion[] = [
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

// Internal normalized model.

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
  specVersion: CdxSpecVersion;
  vulnerabilityCount: number;
}

export interface LoadedSbom {
  metadata: SbomMetadata;
  components: Component[];
}

export type LoadResult =
  | { ok: true; sbom: LoadedSbom }
  | { ok: false; error: string };
