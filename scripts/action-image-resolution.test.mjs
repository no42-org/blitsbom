// Executes action.yml's image-resolution block as bash. The script is
// extracted, not duplicated, so these cases track the real logic — nothing else
// covers it, since the smoke test passes `image:` and skips derivation.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const IMAGE = 'ghcr.io/no42-org/blitsbom';
const RC = `${IMAGE}:report-rc`;

// For a remote action the whole repository is materialised at action_path
// (#159), so the repo root is a realistic stand-in.
const REPO = process.cwd();
const REPO_VERSION = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version;
const SHA = 'a'.repeat(40);

let script;
let noPackageJson;
let unreadable;
let nestedVersion;

beforeAll(() => {
  const run = parse(readFileSync(join(REPO, 'action.yml'), 'utf8')).runs.steps[0].run;
  const cut = run.indexOf('docker run');
  // Guard the index, not emptiness: a missed marker would otherwise keep the
  // whole script and every case below would really invoke docker.
  expect(cut).toBeGreaterThan(0);
  script = `${run.slice(0, cut)}\nprintf '\\nRESOLVED=%s' "$IMAGE"`;

  noPackageJson = mkdtempSync(join(tmpdir(), 'no-pkg-'));

  // A directory named package.json fails the read regardless of uid, unlike
  // chmod 000, which root ignores.
  unreadable = mkdtempSync(join(tmpdir(), 'unreadable-'));
  mkdirSync(join(unreadable, 'package.json'));

  nestedVersion = mkdtempSync(join(tmpdir(), 'nested-'));
  writeFileSync(
    join(nestedVersion, 'package.json'),
    '{\n  "engines": {\n    "version": "9.9.9"\n  },\n  "version": "0.6.0"\n}\n'
  );
});

function run({ ref = '', image = '', actionPath = REPO } = {}) {
  return execFileSync('bash', ['-c', script], {
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      IMAGE_IN: image,
      ACTION_REF: ref,
      GITHUB_ACTION_PATH: actionPath,
      GITHUB_OUTPUT: '/dev/null',
      SBOM: 'bom.json',
      OUTPUT: 'out.html',
      VEX: '',
      COMPRESS: 'auto',
      PROJECT: 'p',
      VERSION_IN: '',
      REF_NAME: 'main',
      REF_TYPE: 'branch',
      COMMIT: 'abc',
      BUILD_URL: 'https://example/run/1',
    },
  });
}

const resolve = (opts) => run(opts).split('RESOLVED=').at(-1);
const logOf = (opts) => run(opts).split('RESOLVED=')[0];

describe('generator image resolution', () => {
  it('an explicit image input always wins', () => {
    expect(resolve({ ref: 'v0.6.0', image: 'custom:tag' })).toBe('custom:tag');
    expect(resolve({ ref: 'main', image: 'custom:tag' })).toBe('custom:tag');
  });

  describe('release tag refs', () => {
    it.each([
      ['v0.6.0', '0.6.0'],
      ['v10.20.30', '10.20.30'],
      ['v1.0.0-rc.1', '1.0.0-rc.1'],
    ])('%s resolves to :report-%s', (ref, version) => {
      expect(resolve({ ref })).toBe(`${IMAGE}:report-${version}`);
    });

    // docker.yml names the image from the git tag via type=semver, so the tag
    // is authoritative and must not be second-guessed by package.json.
    it('prefers the tag over package.json when they disagree', () => {
      expect(resolve({ ref: 'v9.9.9' })).toBe(`${IMAGE}:report-9.9.9`);
      expect(REPO_VERSION).not.toBe('9.9.9');
    });

    // Tag-shaped refs that name no published image must not be derived.
    it.each([
      ['v1.2.3+build.5', "'+' is invalid in an OCI tag"],
      ['v1.2.3.4', 'four components are never published'],
      ['v1.2', 'no such git tag is cut'],
      ['v1', 'no :report-1 is published'],
      ['V0.6.0', 'capitalised'],
    ])('%s falls back (%s)', (ref) => {
      expect(resolve({ ref })).toBe(RC);
    });
  });

  describe('commit-SHA refs', () => {
    it("reads the version from the action's own package.json", () => {
      expect(resolve({ ref: SHA })).toBe(`${IMAGE}:report-${REPO_VERSION}`);
    });

    it('accepts uppercase hex, which Dependabot does not write but a human might', () => {
      expect(resolve({ ref: 'A'.repeat(40) })).toBe(`${IMAGE}:report-${REPO_VERSION}`);
      expect(resolve({ ref: `${'A'.repeat(20)}${'a'.repeat(20)}` })).toBe(
        `${IMAGE}:report-${REPO_VERSION}`
      );
    });

    it('takes the top-level version, not a nested one appearing earlier', () => {
      expect(resolve({ ref: SHA, actionPath: nestedVersion })).toBe(`${IMAGE}:report-0.6.0`);
    });

    // The floor has to hold, or a consumer's workflow fails where it used to
    // degrade. Both of these aborted the step before this was guarded.
    it('falls back when package.json is absent', () => {
      expect(resolve({ ref: SHA, actionPath: noPackageJson })).toBe(RC);
    });

    it('falls back when package.json cannot be read', () => {
      expect(resolve({ ref: SHA, actionPath: unreadable })).toBe(RC);
    });

    it('falls back when action_path is unset entirely', () => {
      const out = execFileSync('bash', ['-c', script], {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          IMAGE_IN: '',
          ACTION_REF: SHA,
          GITHUB_OUTPUT: '/dev/null',
          SBOM: 'b',
          OUTPUT: 'o',
          VEX: '',
          COMPRESS: 'auto',
          PROJECT: 'p',
          VERSION_IN: '',
          REF_NAME: 'main',
          REF_TYPE: 'branch',
          COMMIT: 'c',
          BUILD_URL: 'u',
        },
      });
      expect(out.split('RESOLVED=').at(-1)).toBe(RC);
    });
  });

  describe('everything else gets the main-tip generator', () => {
    it.each([
      ['main', 'a branch ref'],
      ['feature/x', 'a branch ref containing a slash'],
      ['', 'a local `uses: ./`, where action_ref is empty'],
      ['a'.repeat(39), '39 hex characters'],
      ['a'.repeat(41), '41 hex characters'],
      ['g'.repeat(40), '40 non-hex characters'],
      ['refs/tags/v1.2.3', 'a fully qualified ref'],
    ])('%s (%s)', (ref) => {
      expect(resolve({ ref })).toBe(RC);
    });
  });

  describe('the resolution is logged', () => {
    it.each([
      ['v0.6.0', 'tag v0.6.0'],
      [SHA, 'package.json at the pinned commit'],
      ['main', 'no usable version'],
      ['v1.2.3+build.5', 'no usable version'],
    ])('%s reports how it resolved', (ref, fragment) => {
      const log = logOf({ ref });
      expect(log).toContain('generator image:');
      expect(log).toContain(fragment);
    });

    it('says nothing when the image was passed in', () => {
      expect(logOf({ ref: 'v0.6.0', image: 'custom:tag' }).trim()).toBe('');
    });
  });
});
