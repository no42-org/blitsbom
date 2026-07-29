// The generator-image resolution table from action.yml, executed as bash.
//
// This block is the load-bearing part of the action and has produced defects
// three times: a `:report-rc` default that ignored the action's own version, an
// arm matching a `v0.6`-shaped ref that no git tag can ever produce, and a SHA
// pin silently resolving to a mutable image. It is bash embedded in YAML, so
// nothing else in the suite covers it — the smoke test passes `image:`
// explicitly and never exercises derivation at all.
//
// The script is extracted from action.yml rather than duplicated, so the test
// fails if the real logic changes rather than testing a stale copy of it.
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse } from 'yaml';

const IMAGE = 'ghcr.io/no42-org/blitsbom';
const RC = `${IMAGE}:report-rc`;

// The repo root doubles as a realistic action_path: for a remote action the
// whole repository is materialised there (#159), package.json included.
const REPO = process.cwd();
const REPO_VERSION = JSON.parse(readFileSync(join(REPO, 'package.json'), 'utf8')).version;

let script;
let noPackageJson;

beforeAll(() => {
  const run = parse(readFileSync(join(REPO, 'action.yml'), 'utf8')).runs.steps[0].run;
  // Stop before the container runs; only resolution is under test.
  const body = run.slice(0, run.indexOf('docker run'));
  expect(body).not.toBe('');
  // The action logs to stdout, as an Actions step should, so mark the result
  // rather than assuming it is the only thing printed.
  script = `${body}\nprintf '\\nRESOLVED=%s' "$IMAGE"`;
  noPackageJson = mkdtempSync(join(tmpdir(), 'no-pkg-'));
});

// Runs the resolution block and returns its full stdout.
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

// The image the action would run.
const resolve = (opts) => run(opts).split('RESOLVED=').at(-1);
// What it said about how it got there.
const logOf = (opts) => run(opts).split('RESOLVED=')[0];

describe('generator image resolution', () => {
  it('an explicit image input always wins', () => {
    expect(resolve({ ref: 'v0.6.0', image: 'custom:tag' })).toBe('custom:tag');
    expect(resolve({ ref: 'main', image: 'custom:tag' })).toBe('custom:tag');
  });

  describe('release tag refs', () => {
    it.each([
      ['v0.6.0', '0.6.0'],
      ['v0.5.0', '0.5.0'],
      ['v10.20.30', '10.20.30'],
    ])('%s resolves to :report-%s', (ref, version) => {
      expect(resolve({ ref })).toBe(`${IMAGE}:report-${version}`);
    });

    // The tag is authoritative, not a proxy: docker.yml names the image from
    // the git tag via type=semver, so a tag ref must not consult package.json.
    it('prefers the tag over package.json when they disagree', () => {
      expect(resolve({ ref: 'v9.9.9' })).toBe(`${IMAGE}:report-9.9.9`);
      expect(REPO_VERSION).not.toBe('9.9.9');
    });
  });

  describe('commit-SHA refs', () => {
    const sha = 'a'.repeat(40);

    // The behaviour this change exists for. Dependabot pins the release tag's
    // commit, whose package.json carries that release's version.
    it("reads the version from the action's own package.json", () => {
      expect(resolve({ ref: sha })).toBe(`${IMAGE}:report-${REPO_VERSION}`);
    });

    it('accepts any lowercase-hex 40-character ref', () => {
      expect(resolve({ ref: '0123456789abcdef'.repeat(2) + '01234567' })).toBe(
        `${IMAGE}:report-${REPO_VERSION}`
      );
    });

    it('falls back to rc when package.json is not there', () => {
      expect(resolve({ ref: sha, actionPath: noPackageJson })).toBe(RC);
    });
  });

  describe('everything else falls back to the main-tip generator', () => {
    it.each([
      ['main', 'a branch ref'],
      ['feature/x', 'a branch ref containing a slash'],
      ['', 'a local `uses: ./`, where action_ref is empty'],
      ['v1', 'a bare major alias — no :report-1 is published'],
      ['v0.6', 'a minor alias — no such git tag can exist'],
      ['V0.6.0', 'a capitalised tag'],
      ['a'.repeat(39), 'a 39-character hex string'],
      ['a'.repeat(41), 'a 41-character hex string'],
      ['g'.repeat(40), '40 characters that are not hex'],
    ])('%s (%s)', (ref) => {
      expect(resolve({ ref })).toBe(RC);
    });
  });

  describe('the resolution is logged', () => {
    it.each([
      ['v0.6.0', REPO, 'tag v0.6.0'],
      ['a'.repeat(40), REPO, 'package.json at the pinned commit'],
      ['main', REPO, 'no version for'],
    ])('%s reports how it resolved', (ref, actionPath, fragment) => {
      const log = logOf({ ref, actionPath });
      expect(log).toContain('generator image:');
      expect(log).toContain(fragment);
    });

    it('says nothing when the image was passed in', () => {
      expect(logOf({ ref: 'v0.6.0', image: 'custom:tag' }).trim()).toBe('');
    });
  });
});
