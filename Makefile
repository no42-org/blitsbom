.PHONY: help install dev build verify test lint format clean preview dist-zip size-check purity-check smoke e2e ci

help:
	@echo "blitsbom — Make targets"
	@echo "  install         Install npm dependencies"
	@echo "  dev             Run Vite dev server"
	@echo "  build           Build static dist/"
	@echo "  verify          Type-check, lint, run tests, and run purity check"
	@echo "  test            Run the unit test suite"
	@echo "  lint            Type-check and svelte-check"
	@echo "  format          Run prettier across the source tree"
	@echo "  preview         Preview the production build"
	@echo "  size-check      Fail if gzipped JS exceeds 60 KB"
	@echo "  purity-check    Fail if any forbidden network call appears in src/"
	@echo "  smoke           Run the file:// headless-Chromium smoke test"
	@echo "  e2e             Full file:// end-to-end UX check (upload, filter, export)"
	@echo "  dist-zip        Build and zip dist/ as dist.zip"
	@echo "  ci              build + verify + size-check + smoke + e2e (used by CI)"
	@echo "  clean           Remove dist/ and node_modules/"

install:
	npm ci || npm install

dev:
	npm run dev

build:
	npm run build

verify: lint test purity-check

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

smoke:
	npm run smoke

e2e:
	npm run e2e

dist-zip: build
	rm -f dist.zip
	cd dist && zip -r ../dist.zip .

ci: build verify size-check smoke e2e

clean:
	rm -rf dist node_modules dist.zip
