// Cases for the Marketplace metadata guard.
//
// Most of these are regressions from a hand-rolled YAML reader that this guard
// used before it delegated to a real parser: inline comments leaked into
// values, a lookup for `branding.color` matched a same-named key under
// `inputs:`, and a plain multi-line description was truncated at the first
// `word:` in a continuation line — which counted a fragment and passed a
// description that was over the limit. They are kept as tests because a guard
// that silently passes is worse than no guard.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import {
  validateMetadata,
  checkSource,
  findStaleReadmeVersions,
  DESCRIPTION_MAX,
  BRANDING_COLORS,
} from './marketplace-check.mjs';

const ok = (over = {}) => ({
  name: 'blitsbom SBOM report',
  description: 'Short and valid.',
  branding: { icon: 'file-text', color: 'gray-dark' },
  ...over,
});

const check = (yaml) => validateMetadata(parse(yaml));
const problem = (result, fragment) => result.find((p) => p.includes(fragment));

describe('validateMetadata', () => {
  it('accepts complete metadata', () => {
    expect(validateMetadata(ok())).toEqual([]);
  });

  it("accepts the repository's own action.yml", () => {
    const source = readFileSync(join(process.cwd(), 'action.yml'), 'utf8');
    expect(checkSource(source)).toEqual([]);
  });

  describe('description length', () => {
    it(`accepts exactly ${DESCRIPTION_MAX} characters`, () => {
      expect(validateMetadata(ok({ description: 'a'.repeat(DESCRIPTION_MAX) }))).toEqual([]);
    });

    it(`rejects ${DESCRIPTION_MAX + 1} characters`, () => {
      const result = validateMetadata(ok({ description: 'a'.repeat(DESCRIPTION_MAX + 1) }));
      expect(problem(result, `${DESCRIPTION_MAX + 1} characters`)).toBeTruthy();
    });

    // The #151 regression, at the length GitHub reported.
    it('rejects the 181-character description that blocked publishing', () => {
      const result = check(`
name: blitsbom SBOM report
description: >-
  Generate a self-contained, offline HTML SBOM report from a CycloneDX or SPDX
  SBOM using the blitsbom report generator image. Provenance defaults are taken
  from the workflow context.
branding:
  icon: file-text
  color: gray-dark
`);
      expect(problem(result, '181 characters')).toBeTruthy();
    });
  });

  describe('YAML shapes that must not truncate the value', () => {
    // Previously the reader stopped at `note:` and counted only the first
    // fragment, passing an over-long description.
    it('counts every line of a plain multi-line scalar, including one with a colon', () => {
      const result = check(`
name: x
description: Turn an SBOM into a report covering every component listed in it,
  documented at https://example.com/blitsbom, which is comfortably longer than
  a Marketplace listing description is allowed to be
branding:
  icon: file-text
  color: blue
`);
      expect(problem(result, 'characters, at most')).toBeTruthy();
    });

    // The shape that defeated the previous hand-rolled reader is not valid
    // YAML at all: a `word:` opening a continuation line is a nested mapping.
    // The old reader truncated at it and passed; a real parser rejects the
    // file, which must surface as a problem rather than a crash.
    it('reports a nested mapping in a plain scalar instead of truncating it', () => {
      const result = checkSource(`
name: x
description: Turn an SBOM into a report,
  note: this is not valid YAML
branding:
  icon: file-text
  color: blue
`);
      expect(result).toHaveLength(1);
      expect(result[0]).toContain('not valid YAML');
    });

    it('folds a blank line in a folded block to a newline, not two spaces', () => {
      const doc = parse('description: >-\n  aaa\n\n  bbb\n');
      expect(doc.description).toBe('aaa\nbbb');
    });

    it('keeps newlines in a literal block', () => {
      const doc = parse('description: |-\n  aaa\n  bbb\n');
      expect(doc.description).toBe('aaa\nbbb');
    });
  });

  describe('inline comments', () => {
    // Previously the comment text became part of the value, so a valid colour
    // was reported as invalid.
    it('does not treat a trailing comment as part of the colour', () => {
      const result = check(`
name: x
description: Fine.
branding:
  icon: file-text
  color: gray-dark # matches the logo
`);
      expect(result).toEqual([]);
    });

    it('does not count a trailing comment toward the description length', () => {
      const result = check(
        `name: x\ndescription: Short. ${'#'} ${'padding '.repeat(30)}\n` +
          'branding:\n  icon: file-text\n  color: blue\n'
      );
      expect(result).toEqual([]);
    });
  });

  describe('key scoping', () => {
    // Previously `branding.color` matched the first two-space-indented `color:`
    // anywhere in the file, so an input of that name shadowed the real block.
    it('reads branding.color, not a same-named entry under inputs', () => {
      const result = check(`
name: x
description: Fine.
inputs:
  color:
    description: An input that happens to be called color.
    default: not-a-real-color
  icon:
    description: And one called icon.
    default: ''
branding:
  icon: file-text
  color: gray-dark
`);
      expect(result).toEqual([]);
    });

    it('still rejects an invalid colour when such inputs exist', () => {
      const result = check(`
name: x
description: Fine.
inputs:
  color:
    default: gray-dark
branding:
  icon: file-text
  color: black
`);
      expect(problem(result, '"black" is not accepted')).toBeTruthy();
    });
  });

  describe('empty and missing fields', () => {
    it.each(['name', 'description'])('rejects an empty %s', (field) => {
      expect(problem(validateMetadata(ok({ [field]: '' })), field)).toBeTruthy();
    });

    it('rejects a whitespace-only description', () => {
      expect(problem(validateMetadata(ok({ description: '   ' })), 'description')).toBeTruthy();
    });

    it('rejects an empty branding.icon', () => {
      const result = validateMetadata(ok({ branding: { icon: '', color: 'blue' } }));
      expect(problem(result, 'branding.icon')).toBeTruthy();
    });

    it('rejects missing branding', () => {
      const { branding, ...rest } = ok();
      expect(problem(validateMetadata(rest), 'branding')).toBeTruthy();
    });

    it('reports a non-string description once, not as missing and malformed', () => {
      const result = validateMetadata(ok({ description: { en: 'Something' } }));
      expect(result.filter((p) => p.startsWith('description'))).toHaveLength(1);
    });
  });

  describe('branding colour', () => {
    it.each(BRANDING_COLORS)('accepts %s', (color) => {
      expect(validateMetadata(ok({ branding: { icon: 'file-text', color } }))).toEqual([]);
    });

    it('rejects a colour outside the palette', () => {
      const result = validateMetadata(ok({ branding: { icon: 'file-text', color: 'black' } }));
      expect(problem(result, 'not accepted')).toBeTruthy();
    });
  });

  it('reports a document that is not a mapping', () => {
    expect(check('just a string')).toEqual(['action.yml did not parse as a mapping.']);
  });

  it('reports unparseable YAML as a problem, not an exception', () => {
    const result = checkSource('name: [unclosed\ndescription: x\n');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('not valid YAML');
  });
});

// The README is the Marketplace listing body, so a stale example hands a
// visitor a superseded release. v0.6.0's examples outlived the release that
// fixed v0.6.0's own defects (#165).
describe('findStaleReadmeVersions', () => {
  const stale = (md, v = '0.6.1') => findStaleReadmeVersions(md, v);

  it("accepts the repository's own README against package.json", () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const version = JSON.parse(readFileSync(join(process.cwd(), 'package.json'), 'utf8')).version;
    expect(findStaleReadmeVersions(readme, version)).toEqual([]);
  });

  describe('flags a superseded version', () => {
    it.each([
      ['- uses: no42-org/blitsbom@v0.6.0', 'action ref'],
      ['| `@v0.6.0` — a release tag |', 'action ref'],
      ['image defaults to :report-0.6.0', 'generator image'],
      ['docker run ghcr.io/no42-org/blitsbom:0.1.0', 'serving image'],
      ['ghcr.io/no42-org/blitsbom:report-0.4.0 \\', 'generator image'],
    ])('%s', (line, label) => {
      const r = stale(line);
      expect(r).toHaveLength(1);
      expect(r[0]).toContain(label);
      expect(r[0]).toContain('expected 0.6.1');
    });
  });

  describe('accepts the current version', () => {
    it.each([
      '- uses: no42-org/blitsbom@v0.6.1',
      'image defaults to :report-0.6.1',
      'docker run ghcr.io/no42-org/blitsbom:0.6.1',
      '| `@v0.6.1` | `:report-0.6.1` |',
    ])('%s', (line) => {
      expect(stale(line)).toEqual([]);
    });
  });

  // RELEASING.md documents a prerelease flow (vX.Y.Z-rc1); a capture of bare
  // X.Y.Z could never equal such a version, wedging the bump PR.
  describe('prerelease versions', () => {
    it('accepts a matching prerelease ref', () => {
      expect(stale('- uses: no42-org/blitsbom@v1.0.0-rc.1', '1.0.0-rc.1')).toEqual([]);
    });

    it('flags a stale stable ref while a prerelease is current', () => {
      const r = stale('- uses: no42-org/blitsbom@v1.0.0', '1.0.0-rc.1');
      expect(r).toHaveLength(1);
      expect(r[0]).toContain('says 1.0.0, expected 1.0.0-rc.1');
    });

    it('does not swallow a trailing sentence period into the version', () => {
      expect(stale('since `no42-org/blitsbom@v1.0.0-rc.1`.', '1.0.0-rc.1')).toEqual([]);
    });
  });

  // Third-party pins in the same workflow snippet are not ours to version.
  describe('third-party action refs', () => {
    it.each([
      '- uses: actions/upload-artifact@v4.6.2',
      '- uses: actions/checkout@v5.0.1 # full-precision pin',
    ])('%s is not flagged', (line) => {
      expect(stale(line)).toEqual([]);
    });

    it('still flags our own qualified ref on the same line shape', () => {
      expect(stale('- uses: no42-org/blitsbom@v0.6.0')).toHaveLength(1);
    });

    it('still flags a bare backtick-wrapped ref, as the resolution table writes it', () => {
      expect(stale('| `@v0.6.0` — a release tag |')).toHaveLength(1);
    });
  });

  // Migration notes are statements about the past and must survive a bump.
  describe('exempts blockquotes', () => {
    it.each([
      '> **Moved in v0.6.0.** The action was `no42-org/blitsbom/report@v0.5.0`',
      '  > indented blockquote with no42-org/blitsbom@v0.1.0',
      '> pins to `@v0.5.0` keep working, and `:report-0.4.0` still exists',
    ])('%s', (line) => {
      expect(stale(line)).toEqual([]);
    });
  });

  describe('leaves non-version numbers alone', () => {
    it.each([
      ['--version 2.4.1 --output acme-platform-2.4.1-sbom.html', 'a product version in an example'],
      ['make report SBOM=bom.json VERSION=2.4.1', 'a Make variable'],
      ['| a commit SHA | `:report-<that commit\'s version>` |', 'a placeholder, not a version'],
      ['docker run -p 8080:3000 ghcr.io/no42-org/blitsbom:rc', 'a floating tag'],
    ])('%s (%s)', (line) => {
      expect(stale(line)).toEqual([]);
    });
  });

  it('reports every stale reference on a line, with its line number', () => {
    const md = 'intro\n| `@v0.5.0` | `:report-0.4.0` |\n';
    const r = stale(md);
    expect(r).toHaveLength(2);
    expect(r.every((p) => p.includes('README.md:2'))).toBe(true);
  });
});
