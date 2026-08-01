.PHONY: help install dev build build-generator report sbom verify test lint format clean preview dist-zip size-check purity-check marketplace-check smoke e2e docker-build docker-run ci

help:
	@echo "blitsbom — Make targets"
	@echo "  install         Install npm dependencies"
	@echo "  dev             Run Vite dev server"
	@echo "  build           Build static dist/"
	@echo "  build-generator Build the CI report generator (dist-generator/)"
	@echo "  report          Generate a report: make report SBOM=bom.json [OUT=report.html VEX=vex.json]"
	@echo "  sbom            Generate the release SBOM of this tree [OUT=dist.zip.cdx.json]"
	@echo "  verify          Type-check, lint, run tests, purity + marketplace checks"
	@echo "  test            Run the unit test suite"
	@echo "  lint            Type-check and svelte-check"
	@echo "  format          Run prettier across the source tree"
	@echo "  preview         Preview the production build"
	@echo "  size-check      Fail if gzipped JS exceeds 60 KB"
	@echo "  purity-check    Fail if any forbidden network call appears in src/"
	@echo "  marketplace-check Fail if action.yml or the README's version examples would break the listing"
	@echo "  smoke           Run the file:// headless-Chromium smoke test"
	@echo "  e2e             Full file:// end-to-end UX check (upload, filter, export)"
	@echo "  dist-zip        Build and zip dist/ as dist.zip"
	@echo "  docker-build    Build the BusyBox-httpd-based Docker image (tag: blitsbom:latest)"
	@echo "  docker-run      Run the image locally on http://localhost:8080"
	@echo "  ci              build + build-generator + verify + size-check + smoke + e2e (used by CI)"
	@echo "  clean           Remove dist/ and node_modules/"

install:
	npm ci || npm install

dev:
	npm run dev

build:
	npm run build

build-generator:
	npm run build:generator

# Generate a single-file HTML report from an SBOM. Provenance flags are
# optional; a real pipeline uses the GitHub Action, which fills them from the
# workflow context. Example:
#   make report SBOM=bom.json VERSION=2.4.1 OUT=acme-2.4.1-sbom.html
report: build build-generator
	@test -n "$(SBOM)" || { echo "Usage: make report SBOM=path/to/bom.json [OUT=report.html VEX=vex.json]"; exit 2; }
	node dist-generator/blitsbom-report.mjs "$(SBOM)" \
		--template dist/index.html \
		$(if $(OUT),--output "$(OUT)",) \
		$(if $(VEX),--vex "$(VEX)",) \
		$(if $(PROJECT),--project "$(PROJECT)",) \
		$(if $(VERSION),--version "$(VERSION)",)

verify: lint test purity-check marketplace-check

test:
	npm test

lint:
	npm run lint

format:
	npm run format

preview:
	npm run preview

size-check:
	npm run size-check

purity-check:
	npm run purity-check

marketplace-check:
	npm run marketplace-check

smoke:
	npm run smoke

e2e:
	npm run e2e

dist-zip: build
	rm -f dist.zip
	cd dist && zip -r ../dist.zip .

# The SBOM attached to every release. The release workflow calls this target
# rather than invoking syft itself, so the artifact is reproducible from a
# clean checkout and the options that make it correct live in one place.
#
# Each override exists because a syft default silently produced wrong output:
#   - dev dependencies: every dependency here is a devDependency (the bundle is
#     compiled from dev tooling), and syft skips those from package-lock.json,
#     leaving only the root package (#136)
#   - github-actions catalogers: they inventory every `uses:` reference, and git
#     refs carry no licence metadata, so they drowned the report in "Undeclared"
#   - file metadata: the default emits a licence-less `file` component for
#     package-lock.json, showing a raw runner path (#139)
#
# syft runs from the digest-pinned `syft` stage in the Dockerfile, so the
# version is explicit and Dependabot proposes updates to it. The scan target is
# the repository root and is deliberately not configurable — this target
# reproduces one specific artifact.
# `OUT` is target-specific on purpose. A file-scope `OUT ?=` would also reach
# the `report` target above, whose `$(if $(OUT),...)` was written to fall back
# to the generator's own filename when unset — making `make report` write HTML
# into the release SBOM's name, and `make report SBOM=dist.zip.cdx.json`
# overwrite the file it just read.
sbom: OUT ?= dist.zip.cdx.json
# Floor on the component count. syft exits 0 on an empty scan, and every
# override below exists because a silently-wrong result looked plausible: the
# #136 regression produced a one-component SBOM. syft also ignores
# unrecognised SYFT_* variables, so an upstream option rename reproduces that
# exact shape. Well below the real count (196 at v0.6.1); this catches a
# collapse, not drift.
sbom: MIN_COMPONENTS ?= 50
# Handed to the recipe through the environment rather than interpolated into
# the shell text. `$(OUT)` inline would be evaluated by the shell before any
# guard runs, so a value containing backticks executes during the validation
# itself — verified. Reading it from the environment means the value is data,
# never code.
sbom: export SBOM_OUT = $(OUT)
sbom:
	@docker info >/dev/null 2>&1 || { \
		echo "make sbom needs a running Docker daemon: syft runs from the digest-pinned image in the Dockerfile."; \
		echo "Start Docker, or run syft yourself with the three SYFT_* options documented above this target."; \
		exit 1; }
	@case "$$SBOM_OUT" in \
		"") echo "OUT must not be empty."; exit 1 ;; \
		/*) echo "OUT must be relative to the repository root: syft writes from a bind mount, so an absolute path lands inside the container and is lost."; exit 1 ;; \
		..|../*|*/..|*/../*) echo "OUT must not escape the repository: syft writes from a bind mount."; exit 1 ;; \
		*[!A-Za-z0-9._/-]*) echo "OUT may only contain letters, digits, dot, underscore, dash and slash."; exit 1 ;; \
		esac
	@dir=$$(dirname "$$SBOM_OUT"); test -d "$$dir" || { echo "OUT directory does not exist: $$dir"; exit 1; }
	@img=$$(docker build --quiet --target syft .); \
		docker run --rm --user "$$(id -u):$$(id -g)" \
			-e SYFT_JAVASCRIPT_INCLUDE_DEV_DEPENDENCIES=true \
			-e SYFT_SELECT_CATALOGERS=-github-actions \
			-e SYFT_FILE_METADATA_SELECTION=none \
			-v "$(CURDIR):/work" -w /work \
			"$$img" dir:. -o cyclonedx-json="$$SBOM_OUT" -q
	@test -s "$$SBOM_OUT" || { echo "syft reported success but wrote nothing to $$SBOM_OUT."; exit 1; }
	@n=$$(node -e 'const d=require("path").resolve(process.argv[1]);process.stdout.write(String((JSON.parse(require("fs").readFileSync(d,"utf8")).components||[]).length))' "$$SBOM_OUT"); \
		test "$$n" -ge "$(MIN_COMPONENTS)" || { \
			echo "$$SBOM_OUT has only $$n components, below the floor of $(MIN_COMPONENTS) — the scan options are probably not taking effect (see #136)."; \
			exit 1; }; \
		echo "wrote $$SBOM_OUT ($$n components)"

docker-build:
	docker build -t blitsbom:latest .

docker-run:
	docker run --rm --init -p 8080:3000 blitsbom:latest

ci: build build-generator verify size-check smoke e2e

clean:
	rm -rf dist node_modules dist.zip
	rm -f dist.zip.cdx.json dist.zip.cdx.html drift-check.cdx.json drift-check.html
