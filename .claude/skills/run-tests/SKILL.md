---
name: run-tests
description: Run unit and/or E2E test suites and report results. Use when running tests, checking coverage, or validating a change.
argument-hint: "[unit|e2e|all]"
allowed-tools: [Read, Glob, Grep, Bash]
---

# Run Tests

Execute the test suites for the Layershift project and report results.

## Test Mode

- `unit` or empty: run unit tests only
- `e2e`: run E2E tests only
- `all`: run both unit and E2E tests

## Unit Tests (Vitest)

```bash
npm run test
```

- Runner: Vitest with happy-dom environment
- Location: `test/unit/`
- Coverage: pure functions (depth analysis, derivation) and event contracts
- Limitation: happy-dom has no real WebGL — GPU-dependent tests are skipped/mocked

## E2E Tests (Playwright)

```bash
npm run test:e2e
```

- Runner: Playwright with Chromium
- Location: `test/e2e/`
- Server: auto-starts `npm run preview` on port 4173
- Timeout: 30-60s (loads ~47MB of video + depth assets)
- Capabilities: real WebGL context, Shadow DOM inspection, custom event interception

## Quality Gates

### Before Any PR Merge

1. `npm run test` passes (zero failures)
2. `npm run test:e2e` passes (zero failures)
3. No TypeScript errors (`tsc --noEmit`)
4. No console errors in E2E runs
5. New code has corresponding tests (or documented reason why not)

### Before Any Production Release

1. All of the above
2. `npm run build && npm run build:component` succeeds
3. Bundle size hasn't regressed
4. Manual smoke test on preview deployment
5. Cross-browser check (Chrome, Firefox, Safari) for GPU features

## Reporting

After running tests, report:
- Total tests passed / failed / skipped
- Any new uncovered code paths
- Specific failure messages and likely root causes
- Recommendations for additional test coverage
