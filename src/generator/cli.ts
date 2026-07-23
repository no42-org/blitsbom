/*
 * Copyright 2026 Ronny Trommer <ronny@no42.org>
 * SPDX-License-Identifier: MIT
 */

/**
 * `blitsbom report` — command-line entry for the report generator. Parses
 * arguments, delegates to `generateReport`, prints a one-line summary on
 * success, and exits non-zero with the parser's own error text on failure so
 * a CI job never ships a report that greets a recipient with an error banner.
 *
 * Deliberately CI-agnostic: all provenance is passed as explicit flags, never
 * read from CI-specific environment variables. The GitHub Action maps
 * `github.*` context onto these flags.
 */

import { generateReport } from './run';
import { ReportError } from './report';
import type { CompressMode } from './report';

const USAGE = `Usage: blitsbom report <sbom.json> [options]

Options:
  -o, --output <path>     Output HTML path (default: <project>-<version>-sbom.html)
      --vex <path>        CycloneDX VEX to merge into the report
      --template <path>   Built single-file app to embed into
                          (default: $BLITSBOM_TEMPLATE or dist/index.html)
      --compress <mode>   auto | always | never (default: auto — gzip above 2 MB)
      --project <name>    Product name
      --version <ver>     Product version
      --commit <sha>      Build commit
      --build-url <url>   URL of the CI run
      --built-at <iso>    Build timestamp (ISO-8601)
  -h, --help              Show this help
`;

interface ParsedArgs {
  sbomPath?: string;
  outputPath?: string;
  vexPath?: string;
  /** Undefined when not passed; the caller resolves a default. */
  templatePath?: string;
  compress: CompressMode;
  project?: string;
  version?: string;
  commit?: string;
  buildUrl?: string;
  builtAt?: string;
  help: boolean;
}

const COMPRESS_MODES = new Set(['auto', 'always', 'never']);

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    compress: 'auto',
    help: false,
  };
  const next = (i: number, flag: string): string => {
    const value = argv[i + 1];
    if (value === undefined) throw new ReportError(`Missing value for ${flag}`);
    return value;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    switch (arg) {
      case '-h':
      case '--help':
        parsed.help = true;
        break;
      case '-o':
      case '--output':
        parsed.outputPath = next(i, arg);
        i += 1;
        break;
      case '--vex':
        parsed.vexPath = next(i, arg);
        i += 1;
        break;
      case '--template':
        parsed.templatePath = next(i, arg);
        i += 1;
        break;
      case '--compress': {
        const mode = next(i, arg);
        if (!COMPRESS_MODES.has(mode)) {
          throw new ReportError(
            `Invalid --compress value "${mode}" (expected auto|always|never)`,
          );
        }
        parsed.compress = mode as CompressMode;
        i += 1;
        break;
      }
      case '--project':
        parsed.project = next(i, arg);
        i += 1;
        break;
      case '--version':
        parsed.version = next(i, arg);
        i += 1;
        break;
      case '--commit':
        parsed.commit = next(i, arg);
        i += 1;
        break;
      case '--build-url':
        parsed.buildUrl = next(i, arg);
        i += 1;
        break;
      case '--built-at':
        parsed.builtAt = next(i, arg);
        i += 1;
        break;
      default:
        if (arg.startsWith('-')) throw new ReportError(`Unknown option: ${arg}`);
        if (parsed.sbomPath) {
          throw new ReportError(`Unexpected extra argument: ${arg}`);
        }
        parsed.sbomPath = arg;
    }
  }
  return parsed;
}

export function main(argv: string[]): number {
  let args: ParsedArgs;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (args.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (!args.sbomPath) {
    process.stderr.write(`Missing SBOM path.\n\n${USAGE}`);
    return 2;
  }

  // Template resolution order: --template, then $BLITSBOM_TEMPLATE (set by the
  // report container image), then the local build output.
  const templatePath =
    args.templatePath ?? process.env.BLITSBOM_TEMPLATE ?? 'dist/index.html';

  try {
    const result = generateReport({
      sbomPath: args.sbomPath,
      templatePath,
      vexPath: args.vexPath,
      outputPath: args.outputPath,
      compress: args.compress,
      project: args.project,
      version: args.version,
      commit: args.commit,
      buildUrl: args.buildUrl,
      builtAt: args.builtAt,
    });
    process.stdout.write(`${result.summary}\n→ ${result.outputPath}\n`);
    return 0;
  } catch (err) {
    if (err instanceof ReportError) {
      process.stderr.write(`blitsbom report: ${err.message}\n`);
      return 1;
    }
    throw err;
  }
}

// Run when invoked directly (the built .mjs), not when imported by tests.
if (
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
  process.exit(main(process.argv.slice(2)));
}
