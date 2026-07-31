/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { CDX_HIGHEST_VERIFIED_MINOR, CDX_SUPPORTED_MAJOR } from '../types';
import type { SbomMetadata } from '../types';

type SpecFields = Pick<SbomMetadata, 'sbomFormat' | 'specVersion'>;

/**
 * True when a CycloneDX document declares a minor this build has never been
 * checked against.
 *
 * The version gate deliberately accepts any 1.x at or above the floor, so a
 * document can parse on the assumption that CycloneDX minors stay additive
 * (#171). That assumption is verified up to CDX_HIGHEST_VERIFIED_MINOR and
 * merely assumed above it, and those are different claims. A reader deciding
 * whether to trust a licence rollup should be able to tell them apart.
 *
 * DOM-free on purpose: the report generator renders the same label in Node.
 */
export function isUnverifiedCdxMinor(meta: SpecFields): boolean {
  if (meta.sbomFormat !== 'CycloneDX-1.x') return false;
  const parts = meta.specVersion.split('.');
  if (parts.length !== 2) return false;
  if (!/^\d+$/.test(parts[0]!) || !/^\d+$/.test(parts[1]!)) return false;
  return (
    Number(parts[0]) === CDX_SUPPORTED_MAJOR &&
    Number(parts[1]) > CDX_HIGHEST_VERIFIED_MINOR
  );
}

/**
 * The format line shown in the app header, the report provenance header and
 * the generator's summary. One function so the three cannot drift; they were
 * three copies of the same expression before.
 */
export function formatSpecLabel(meta: SpecFields): string {
  const base =
    meta.sbomFormat === 'CycloneDX-1.x'
      ? `CycloneDX ${meta.specVersion}`
      : meta.specVersion;
  return isUnverifiedCdxMinor(meta) ? `${base} (newer than this build)` : base;
}
