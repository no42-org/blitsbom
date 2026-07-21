/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseSbomText, parseAsVex } from './load';
import { detectFormat } from './format-detect';
import { normalizeLicenseValue } from './licenseValue';
import { canonicalizePurl } from './purlMatch';

// Property-based robustness tests for the parsing layer.
//
// SECURITY.md puts "denial of service from a malformed or hostile SBOM" in
// scope, and every function here consumes a file some other party produced.
// The example-based tests in the sibling *.test.ts files cover SBOMs that are
// well-formed; these cover the ones that are not.
//
// The contract under test is deliberately narrow: **these functions return a
// value or a tagged error, they never throw**. A thrown TypeError from deep
// inside a normalizer escapes to the UI as an unhandled rejection and takes
// the page down — for a viewer whose entire promise is "open this file
// safely", that is the failure that matters. Whether a given hostile input is
// classified as CycloneDX, SPDX or unknown is not asserted; only that a
// verdict is reached at all.
//
// Runs are kept modest so `make verify` stays fast; the value is in the shape
// of the generated inputs, not in the iteration count. Override for a deeper
// soak when touching the parsers:
//
//   FUZZ_RUNS=20000 npx vitest run src/parse/robustness.test.ts
const RUNS = { numRuns: Number(process.env.FUZZ_RUNS ?? 300) };

/** JSON values, including the awkward ones: deep nesting, unicode, huge and
 * negative numbers, empty keys. `fc.jsonValue` already biases toward these. */
const anyJson = () => fc.jsonValue({ maxDepth: 6 });

/** Plausible-looking SBOM envelopes with arbitrary junk in the fields the
 * parsers actually read. This is the interesting middle ground: not random
 * noise (which `detectFormat` rejects immediately) but documents that get far
 * enough in to reach the normalizers. */
const sbomShaped = () =>
  fc.oneof(
    // CycloneDX-shaped: passes detectFormat, then anything goes.
    fc.record(
      {
        bomFormat: fc.constant('CycloneDX'),
        specVersion: fc.oneof(
          fc.constantFrom('1.4', '1.5', '1.6', '1.2', '9.9', '', 'NaN'),
          fc.string(),
        ),
        components: fc.oneof(anyJson(), fc.array(anyJson(), { maxLength: 20 })),
        vulnerabilities: fc.oneof(
          anyJson(),
          fc.array(anyJson(), { maxLength: 20 }),
        ),
        metadata: anyJson(),
      },
      { requiredKeys: ['bomFormat', 'specVersion'] },
    ),
    // SPDX-shaped: same idea against the other parser.
    fc.record(
      {
        spdxVersion: fc.oneof(
          fc.constantFrom('SPDX-2.2', 'SPDX-2.3', 'SPDX-3.0', 'SPDX-', ''),
          fc.string(),
        ),
        packages: fc.oneof(anyJson(), fc.array(anyJson(), { maxLength: 20 })),
        hasExtractedLicensingInfos: fc.oneof(
          anyJson(),
          fc.array(anyJson(), { maxLength: 10 }),
        ),
        name: anyJson(),
        creationInfo: anyJson(),
      },
      { requiredKeys: ['spdxVersion'] },
    ),
  );

describe('parseSbomText — never throws', () => {
  it('returns a tagged result for arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const r = parseSbomText(text);
        expect(typeof r.ok).toBe('boolean');
      }),
      RUNS,
    );
  });

  it('returns a tagged result for arbitrary JSON', () => {
    fc.assert(
      fc.property(anyJson(), (value) => {
        const r = parseSbomText(JSON.stringify(value));
        expect(typeof r.ok).toBe('boolean');
      }),
      RUNS,
    );
  });

  // The one that actually exercises the normalizers, rather than bouncing
  // off the format detector.
  it('survives SBOM-shaped documents with hostile field contents', () => {
    fc.assert(
      fc.property(sbomShaped(), (doc) => {
        const r = parseSbomText(JSON.stringify(doc));
        expect(typeof r.ok).toBe('boolean');
        // When a document is accepted, the shape downstream code relies on
        // must hold — an "ok" result carrying a non-array components list
        // would crash the table renderer instead of the parser.
        if (r.ok) {
          expect(Array.isArray(r.sbom.components)).toBe(true);
          expect(typeof r.sbom.metadata).toBe('object');
        } else {
          expect(typeof r.error).toBe('string');
        }
      }),
      RUNS,
    );
  });
});

describe('parseAsVex — never throws', () => {
  // The VEX path merges an untrusted second file against an already-loaded
  // SBOM, so it takes two inputs and has more room to go wrong.
  it('returns a tagged result for arbitrary VEX input', () => {
    const base = parseSbomText(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        components: [{ name: 'a', version: '1', purl: 'pkg:npm/a@1' }],
      }),
    );
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    fc.assert(
      fc.property(fc.oneof(fc.string(), anyJson(), sbomShaped()), (input) => {
        const text = typeof input === 'string' ? input : JSON.stringify(input);
        const r = parseAsVex(text, base.sbom, 'fuzz.json');
        expect(typeof r.kind).toBe('string');
      }),
      RUNS,
    );
  });
});

// The counterexamples fast-check shrank to on its first run. Pinned as
// explicit cases so they stay covered regardless of generator or seed changes.
// Both were reachable by dropping a file into the page: a single null entry in
// an array threw a TypeError out of the normalizer and took the UI down.
describe('regressions found by fuzzing', () => {
  it('SPDX: a null entry in packages[] is skipped, not fatal', () => {
    const r = parseSbomText(
      JSON.stringify({
        spdxVersion: 'SPDX-2.2',
        packages: [
          null,
          { name: 'real', versionInfo: '1.0', licenseConcluded: 'MIT' },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // The good package still loads — the file is not rejected wholesale.
    expect(r.sbom.components).toHaveLength(1);
    expect(r.sbom.components[0]!.name).toBe('real');
  });

  it('CycloneDX: a null entry in components[] is skipped, not fatal', () => {
    const r = parseSbomText(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        components: [null, { name: 'real', version: '1.0' }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components).toHaveLength(1);
    expect(r.sbom.components[0]!.name).toBe('real');
  });

  it('VEX: a null entry in vulnerabilities[] is skipped, not fatal', () => {
    const base = parseSbomText(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        components: [{ name: 'foo', version: '1.0', purl: 'pkg:npm/foo@1.0' }],
      }),
    );
    expect(base.ok).toBe(true);
    if (!base.ok) return;

    const r = parseAsVex(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.4',
        vulnerabilities: [
          null,
          {
            id: 'CVE-2026-0001',
            ratings: [{ severity: 'high' }],
            affects: [{ ref: 'pkg:npm/foo@1.0' }],
          },
        ],
      }),
      base.sbom,
      'vex.json',
    );
    expect(r.kind).toBe('vex');
    if (r.kind !== 'vex') return;
    // The null is skipped and the real advisory still attaches — the good
    // entry must survive alongside the bad one, not be lost with it.
    expect(r.sbom.components[0]!.vulnerabilities).toHaveLength(1);
    expect(r.sbom.components[0]!.vulnerabilities![0]!.id).toBe('CVE-2026-0001');
  });

  // Non-object scalars take the same path as null.
  it('skips scalar entries in components[]', () => {
    const r = parseSbomText(
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        components: ['nope', 42, true, { name: 'real', version: '1.0' }],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sbom.components).toHaveLength(1);
  });
});

describe('leaf parsers — never throw', () => {
  it('detectFormat classifies any JSON value', () => {
    fc.assert(
      fc.property(anyJson(), (value) => {
        expect(['cyclonedx', 'spdx', 'unknown']).toContain(detectFormat(value));
      }),
      RUNS,
    );
  });

  // License strings are free-form text straight out of the file, and the
  // SPDX-expression handling is regex-heavy — a good place for a pathological
  // input to hide.
  it('normalizeLicenseValue handles arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (raw) => {
        const r = normalizeLicenseValue(raw);
        expect(typeof r).toBe('object');
        expect(r).not.toBeNull();
      }),
      RUNS,
    );
  });

  it('canonicalizePurl handles arbitrary strings and nullish input', () => {
    fc.assert(
      fc.property(fc.option(fc.string(), { nil: undefined }), (raw) => {
        const r = canonicalizePurl(raw);
        expect(r === null || typeof r === 'string').toBe(true);
      }),
      RUNS,
    );
  });

  // purls are structured, so generate strings that look like one. Random
  // strings rarely reach the interesting parsing branches.
  it('canonicalizePurl handles purl-shaped strings', () => {
    const purlish = fc
      .tuple(
        fc.constantFrom('pkg', 'PKG', '', 'http'),
        fc.constantFrom('npm', 'maven', 'golang', 'generic', ''),
        fc.string(),
        fc.string(),
      )
      .map(([scheme, type, name, rest]) => `${scheme}:${type}/${name}@${rest}`);

    fc.assert(
      fc.property(purlish, (raw) => {
        const r = canonicalizePurl(raw);
        expect(r === null || typeof r === 'string').toBe(true);
      }),
      RUNS,
    );
  });
});
