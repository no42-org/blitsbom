/**
 * Canonicalize a Package URL (purl) for tolerant matching between an
 * SBOM's component identifiers and a VEX's `affects[].ref` values.
 *
 * Two valid purls referring to the same artifact often differ in
 * cosmetic ways:
 *
 *   pkg:maven/org.example/foo@1.2.3?type=jar
 *   pkg:maven/org.example/foo@1.2.3?type=jar&classifier=sources
 *   pkg:Maven/org.example/foo@1.2.3?Type=jar
 *
 * The canonical form lowercases the scheme prefix, type, and namespace
 * (which the spec defines as case-insensitive), keeps the name and
 * version verbatim (case-sensitive per spec), and retains only the
 * small set of qualifiers that meaningfully change identity:
 *
 *   - `type` for Maven (jar vs pom vs ear)
 *   - `arch` for Debian/RPM packages (amd64 vs arm64)
 *   - `repository_url` when present (distinguishes private vs public)
 *
 * Other qualifiers (classifier, download_url, ...) are dropped so that
 * a slightly enriched VEX ref still matches a vanilla SBOM purl.
 *
 * Spec reference: https://github.com/package-url/purl-spec
 */

const IDENTITY_QUALIFIERS = new Set(['type', 'arch', 'repository_url']);

export function canonicalizePurl(p: string | null | undefined): string | null {
  if (typeof p !== 'string') return null;
  const trimmed = p.trim();
  if (!trimmed.startsWith('pkg:')) return null;

  // Split body from optional ?qualifiers and #subpath.
  const hashIdx = trimmed.indexOf('#');
  const bodyAndQuery = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const qIdx = bodyAndQuery.indexOf('?');
  const body = qIdx >= 0 ? bodyAndQuery.slice(0, qIdx) : bodyAndQuery;
  const query = qIdx >= 0 ? bodyAndQuery.slice(qIdx + 1) : '';

  // Body shape: pkg:type/namespace/name@version
  // namespace is optional and may itself contain slashes (e.g. @scope/pkg).
  const afterScheme = body.slice('pkg:'.length);
  const firstSlash = afterScheme.indexOf('/');
  if (firstSlash <= 0) return null;
  const type = afterScheme.slice(0, firstSlash).toLowerCase();
  let rest = afterScheme.slice(firstSlash + 1);

  // Split rest into "namespace + name@version". Use the LAST `@` since
  // npm scoped names embed an extra `@` in the namespace (`@scope`).
  const atIdx = rest.lastIndexOf('@');
  const beforeAt = atIdx >= 0 ? rest.slice(0, atIdx) : rest;
  const versionPart = atIdx >= 0 ? rest.slice(atIdx) : '';
  const lastSlash = beforeAt.lastIndexOf('/');
  let namespace = '';
  let name = beforeAt;
  if (lastSlash >= 0) {
    namespace = beforeAt.slice(0, lastSlash);
    name = beforeAt.slice(lastSlash + 1);
  }
  // Per purl spec: namespace is case-insensitive for some types; we
  // lowercase it uniformly. The spec exempts a few (e.g. github org
  // names that allow case) but cross-tool VEX/SBOM agreement treats
  // namespaces as case-insensitive in practice.
  namespace = namespace.toLowerCase();
  rest = (namespace ? namespace + '/' : '') + name + versionPart;

  // Filter qualifiers down to the identity allowlist, lowercase keys
  // and trim values.
  const kept: string[] = [];
  if (query) {
    for (const part of query.split('&')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const key = part.slice(0, eq).toLowerCase().trim();
      const value = part.slice(eq + 1).trim();
      if (!key || !value) continue;
      if (!IDENTITY_QUALIFIERS.has(key)) continue;
      kept.push(`${key}=${value}`);
    }
    kept.sort();
  }

  const canonical = `pkg:${type}/${rest}` + (kept.length ? `?${kept.join('&')}` : '');
  return canonical;
}
