import { describe, expect, it } from 'vitest';
import { canonicalizePurl } from './purlMatch';

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
