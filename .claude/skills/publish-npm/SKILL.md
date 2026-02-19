---
name: publish-npm
description: npm publishing workflow — version bump, build, verify, publish. Use when publishing a new version of the layershift package to npm.
argument-hint: "[patch|minor|major|prerelease] [--dry-run]"
allowed-tools: [Read, Glob, Grep, Bash]
---

# Publish to npm

Execute the full npm publishing workflow for the `layershift` package.

## Pre-Flight Checks

1. Confirm you are on `main` with a clean working tree:
   ```bash
   git status
   ```
2. Confirm npm authentication:
   ```bash
   npm whoami
   ```

## Publishing Checklist

Execute these steps in order. Stop on any failure.

### 1. Version Bump

Determine the version increment from `$ARGUMENTS` (defaults to `patch`):

```bash
npm version $1
```

- Breaking changes to Web Component API -> major
- New features, attributes, events -> minor
- Bug fixes, performance improvements -> patch
- Pre-release: use `--preid=alpha`, `--preid=beta`, or `--preid=rc`

### 2. Build

```bash
npm run build:package
```

This runs: `build:component` (IIFE) -> `build:npm` (ESM) -> `build:types` (declarations).
Must complete with zero errors.

### 3. Dry Run

```bash
npm pack --dry-run
```

Verify the file list includes:
- `dist/npm/layershift.es.js`
- `dist/components/layershift.js`
- `dist/types/`
- `LICENSE`, `README.md`, `package.json`

Verify it does NOT include: `src/`, `scripts/`, `docs/`, `public/`, `node_modules/`, config files.

### 4. Size Check

Verify gzipped bundle size hasn't regressed unexpectedly against previous release.

### 5. Type Check

Verify `dist/types/` contains expected `.d.ts` files.

### 6. Test Gate

```bash
npm run test
```

Must pass with zero failures.

### 7. Publish

If `$ARGUMENTS` contains `--dry-run`, stop here and report what would be published.

Otherwise:

```bash
npm publish
```

The `prepublishOnly` hook runs `build:package` automatically as a safety net.

### 8. Post-Publish

- Verify the package is live: `npm view layershift version`
- Report the published version and bundle sizes

## Critical Rules

- The `types` condition MUST come first in every exports map entry
- Never publish from a dirty working tree
- Never skip the dry run on major or minor releases
