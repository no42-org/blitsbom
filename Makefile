.PHONY: help install dev build build-generator report verify test lint format clean preview dist-zip size-check purity-check marketplace-check smoke e2e docker-build docker-run ci

help:
	@echo "blitsbom — Make targets"
	@echo "  install         Install npm dependencies"
	@echo "  dev             Run Vite dev server"
	@echo "  build           Build static dist/"
	@echo "  build-generator Build the CI report generator (dist-generator/)"
	@echo "  report          Generate a report: make report SBOM=bom.json [OUT=report.html VEX=vex.json]"
	@echo "  verify          Type-check, lint, run tests, purity + marketplace checks"
	@echo "  test            Run the unit test suite"
	@echo "  lint            Type-check and svelte-check"
	@echo "  format          Run prettier across the source tree"
	@echo "  preview         Preview the production build"
	@echo "  size-check      Fail if gzipped JS exceeds 60 KB"
	@echo "  purity-check    Fail if any forbidden network call appears in src/"
	@echo "  marketplace-check Fail if action.yml would be rejected by the Marketplace"
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

docker-build:
	docker build -t blitsbom:latest .

docker-run:
	docker run --rm --init -p 8080:3000 blitsbom:latest

ci: build build-generator verify size-check smoke e2e

clean:
	rm -rf dist node_modules dist.zip
