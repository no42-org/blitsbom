import { describe, expect, it } from 'vitest';
import { canonicalizePurl, originatorFromPurl } from './purlMatch';

describe('canonicalizePurl', () => {
  it('returns null for null / undefined / empty / non-purl input', () => {
    expect(canonicalizePurl(null)).toBe(null);
    expect(canonicalizePurl(undefined)).toBe(null);
    expect(canonicalizePurl('')).toBe(null);
    expect(canonicalizePurl('not-a-purl')).toBe(null);
    expect(canonicalizePurl('pkg:')).toBe(null);
  });

  it('lowercases type', () => {
    expect(canonicalizePurl('pkg:Maven/org.example/foo@1.0')).toBe(
      'pkg:maven/org.example/foo@1.0',
    );
  });

  it('lowercases namespace, keeps name and version verbatim', () => {
    expect(canonicalizePurl('pkg:npm/@SCOPE/Foo@1.0.0-RC1')).toBe(
      'pkg:npm/@scope/Foo@1.0.0-RC1',
    );
  });

  it('keeps `type` qualifier for maven', () => {
    expect(canonicalizePurl('pkg:maven/org.example/foo@1.0?type=jar')).toBe(
      'pkg:maven/org.example/foo@1.0?type=jar',
    );
  });

  it('drops a `classifier` qualifier (non-identity-bearing)', () => {
    expect(
      canonicalizePurl('pkg:maven/org.example/foo@1.0?type=jar&classifier=sources'),
    ).toBe('pkg:maven/org.example/foo@1.0?type=jar');
  });

  it('keeps `arch` for deb / rpm', () => {
    expect(canonicalizePurl('pkg:deb/debian/curl@7.88.1?arch=amd64')).toBe(
      'pkg:deb/debian/curl@7.88.1?arch=amd64',
    );
    expect(canonicalizePurl('pkg:rpm/fedora/glibc@2.38?arch=x86_64')).toBe(
      'pkg:rpm/fedora/glibc@2.38?arch=x86_64',
    );
  });

  it('keeps `repository_url`', () => {
    expect(
      canonicalizePurl(
        'pkg:maven/org.example/foo@1.0?repository_url=https://repo.maven.apache.org',
      ),
    ).toBe(
      'pkg:maven/org.example/foo@1.0?repository_url=https://repo.maven.apache.org',
    );
  });

  it('lowercases qualifier keys', () => {
    expect(canonicalizePurl('pkg:maven/org.example/foo@1.0?Type=Jar')).toBe(
      'pkg:maven/org.example/foo@1.0?type=Jar',
    );
  });

  it('sorts surviving qualifiers alphabetically', () => {
    expect(
      canonicalizePurl('pkg:deb/debian/curl@7.88.1?type=binary&arch=amd64'),
    ).toBe('pkg:deb/debian/curl@7.88.1?arch=amd64&type=binary');
  });

  it('trims surrounding whitespace', () => {
    expect(canonicalizePurl('  pkg:npm/foo@1.0  ')).toBe('pkg:npm/foo@1.0');
  });

  it('handles purls without a namespace', () => {
    expect(canonicalizePurl('pkg:pypi/requests@2.31.0')).toBe(
      'pkg:pypi/requests@2.31.0',
    );
  });

  it('handles npm scoped names whose namespace is the @scope', () => {
    expect(canonicalizePurl('pkg:npm/@types/node@22.0.0')).toBe(
      'pkg:npm/@types/node@22.0.0',
    );
  });

  it('strips fragment / subpath', () => {
    expect(canonicalizePurl('pkg:npm/foo@1.0#path/to/sub')).toBe(
      'pkg:npm/foo@1.0',
    );
  });

  it('two cosmetically different purls collapse to the same canonical', () => {
    const a = canonicalizePurl('pkg:Maven/org.example/foo@1.2.3?type=jar');
    const b = canonicalizePurl(
      'pkg:maven/org.example/foo@1.2.3?type=jar&classifier=sources',
    );
    expect(a).toBe(b);
  });
});

describe('originatorFromPurl', () => {
  it('returns the Maven groupId', () => {
    expect(originatorFromPurl('pkg:maven/com.google.guava/guava@33.0')).toBe(
      'com.google.guava',
    );
  });

  it('decodes a scoped npm namespace rather than showing %40', () => {
    expect(originatorFromPurl('pkg:npm/%40angular/core@17.0.0')).toBe(
      '@angular',
    );
    // Some generators emit the scope unencoded; both must agree.
    expect(originatorFromPurl('pkg:npm/@angular/core@17.0.0')).toBe('@angular');
  });

  it('keeps every segment of a multi-segment namespace', () => {
    // Truncating to the first segment would collapse every Go module on
    // GitHub into one bucket. (#169)
    expect(
      originatorFromPurl('pkg:golang/github.com/gorilla/mux@v1.8.0'),
    ).toBe('github.com/gorilla');
  });

  it('returns the distro for OS packages', () => {
    expect(originatorFromPurl('pkg:deb/debian/curl@7.88.1-10')).toBe('debian');
    expect(originatorFromPurl('pkg:apk/alpine/musl@1.2.4')).toBe('alpine');
  });

  it('returns null for namespaceless purl types', () => {
    expect(originatorFromPurl('pkg:pypi/requests@2.31.0')).toBe(null);
    expect(originatorFromPurl('pkg:cargo/serde@1.0.197')).toBe(null);
    expect(originatorFromPurl('pkg:oci/nginx@sha256%3Aabc')).toBe(null);
    expect(originatorFromPurl('pkg:generic/openssl@3.0.13')).toBe(null);
  });

  it('returns null for null / empty / malformed input', () => {
    expect(originatorFromPurl(null)).toBe(null);
    expect(originatorFromPurl('')).toBe(null);
    expect(originatorFromPurl('not-a-purl')).toBe(null);
    expect(originatorFromPurl('pkg:')).toBe(null);
    expect(originatorFromPurl('pkg:/foo/bar@1.0')).toBe(null);
  });

  it('ignores qualifiers and subpath', () => {
    expect(
      originatorFromPurl('pkg:maven/org.example/foo@1.2.3?type=jar'),
    ).toBe('org.example');
    expect(
      originatorFromPurl('pkg:golang/github.com/x/y@v1#sub/dir'),
    ).toBe('github.com/x');
  });

  it('keeps namespace case verbatim, unlike canonicalizePurl', () => {
    // The rollup label is displayed; the canonical form is a join key.
    expect(originatorFromPurl('pkg:github/NixOS/nixpkgs@1.0')).toBe(
      'NixOS',
    );
  });

  it('keeps a segment with a malformed escape rather than dropping it', () => {
    expect(originatorFromPurl('pkg:maven/100%discount/foo@1.0')).toBe(
      '100%discount',
    );
  });

  it('handles a purl with no version', () => {
    expect(originatorFromPurl('pkg:maven/com.google.guava/guava')).toBe(
      'com.google.guava',
    );
  });
});
