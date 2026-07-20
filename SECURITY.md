# Security Policy

## Reporting a vulnerability

**Please do not open a public issue for a security problem.**

Report it through GitHub's private vulnerability reporting:

> **[Report a vulnerability](https://github.com/no42-org/blitsbom/security/advisories/new)**

That creates a private advisory visible only to the maintainers. You will get an acknowledgement within **7 days**, and we will keep you updated as we work on a fix. If you would like credit in the advisory, say so in the report.

This is a small volunteer-maintained project, not a vendor with an on-call rotation — please size your expectations accordingly. We will always tell you honestly where a report stands rather than leaving you guessing.

## Supported versions

Only the **latest release** is supported. Fixes ship in a new release rather than as backports to older tags.

| Version        | Supported |
| -------------- | --------- |
| latest release | ✅        |
| anything older | ❌        |

## What is in scope

blitsbom is a static, browser-only application. It has no server, no backend, no accounts and no telemetry — so the interesting attack surface is what happens to a file you open in it.

Squarely in scope:

- **Anything that causes data to leave the browser.** The core promise is that your SBOM never goes anywhere. A network call from the built bundle is the most serious bug this project can have.
- **XSS or script execution via a crafted SBOM.** Component names, licenses and VEX fields are attacker-controlled input if you open someone else's file.
- **Denial of service from a malformed or hostile SBOM** — a parser that hangs or exhausts memory on a small input.
- **Supply-chain integrity issues**: the release pipeline, the published container image, the cosign signatures or the SBOM attestation.

Generally out of scope:

- Missing HTTP security headers when _you_ self-host the bundle — that is your web server's configuration, not something the bundle controls.
- Findings that require an already-compromised browser, OS or machine.
- Automated scanner output with no demonstrated impact on this application.

## Verifying what you downloaded

Every release artifact and container image is signed with cosign (keyless, via Sigstore), and images carry a CycloneDX SBOM attestation. The verification commands, including the expected signing identity, are in [RELEASING.md](./RELEASING.md#verifying-the-release).

If a signature does not verify, treat the artifact as untrusted and tell us via the private report link above.
