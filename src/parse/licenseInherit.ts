/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import type { Component, LicenseCategory } from '../types';
import { classifyComponent } from '../license/classify';

/**
 * Give an unlicensed component the licenses of its twins: components in
 * the same SBOM with the same purl, qualifiers and subpath ignored. Fat
 * and shaded jars drop the manifest of a nested copy, so syft finds no
 * license there although the same library elsewhere in the image declares
 * one. Twins that disagree on the category leave it undeclared. Mutates
 * the components in place and marks each one it fills. (#323)
 */
export function inheritTwinLicenses(components: readonly Component[]): void {
  const twins = new Map<string, Component[]>();
  for (const c of components) {
    const key = twinKey(c);
    if (key === null) continue;
    const group = twins.get(key);
    if (group) group.push(c);
    else twins.set(key, [c]);
  }

  for (const group of twins.values()) {
    if (group.length < 2) continue;
    const licensed = group.filter(
      (c) => !isUnlicensed(c) && classifyComponent(c.licenses) !== 'undeclared',
    );
    const cats = new Set<LicenseCategory>(licensed.map((c) => classifyComponent(c.licenses)));
    if (cats.size !== 1) continue;
    const source = licensed[0]!;
    group.forEach((c) => {
      // A file entry stays out of the license charts (see isLicensable).
      if (!isUnlicensed(c) || c.type === 'file') return;
      c.licenses = source.licenses.map((l) => ({ ...l }));
      c.licensesInherited = true;
    });
  }
}

/** No license entry, or only NOASSERTION ones. A component that declares
 * anything else keeps its own list. */
function isUnlicensed(c: Component): boolean {
  return c.licenses.every((l) => l.value.trim() === '' || l.value.trim() === 'NOASSERTION');
}

/** The canonical purl without qualifiers, or null when it has no version.
 * `purlCanonical` already drops the subpath. */
function twinKey(c: Component): string | null {
  const purl = c.purlCanonical?.split('?')[0];
  if (!purl) return null;
  const name = purl.slice(purl.lastIndexOf('/') + 1);
  return name.includes('@') ? purl : null;
}
