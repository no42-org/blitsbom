/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import type { ReportProvenance, SbomMetadata } from '../types';
import { slugify } from '../parse/util';

/**
 * Offer the verbatim embedded SBOM as a file download. Produced entirely
 * locally (Blob + object URL) with no network request, so a report shared as
 * a single file still hands back the machine-readable original.
 */
export function downloadOriginalSbom(
  sourceText: string,
  provenance: ReportProvenance | null,
  metadata: SbomMetadata | null,
): void {
  const filename = originalSbomFilename(provenance, metadata);
  const blob = new Blob([sourceText], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Prefer the source filename recorded at generation time; otherwise derive
 * `<project>-<version>-sbom.json` from provenance or SBOM metadata. */
export function originalSbomFilename(
  provenance: ReportProvenance | null,
  metadata: SbomMetadata | null,
): string {
  if (provenance?.sourceFilename) return provenance.sourceFilename;
  const project = provenance?.project ?? metadata?.projectName ?? null;
  const version = provenance?.version ?? metadata?.productVersion ?? null;
  const base = [project, version].filter(Boolean).join('-');
  return `${slugify(base) || 'sbom'}-sbom.json`;
}
