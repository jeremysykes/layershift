---
name: audit-docs
description: Audit documentation for accuracy against the current codebase. Use when reviewing PRs for documentation impact or checking for stale docs.
argument-hint: "[file or module to audit]"
allowed-tools: [Read, Glob, Grep]
user-invocable: true
---

# Audit Documentation

Check project documentation for accuracy and completeness against the current codebase.

## Audit Checklist

For any change, check each item:

1. **Module map**: Was a module added, removed, or renamed? -> Update `docs/architecture.md`
2. **Effect behavior**: Was an effect's behavior altered? -> Update `docs/<effect>/`
3. **Flow or lifecycle**: Was a flow or lifecycle modified? -> Update `docs/diagrams/`
4. **Architectural decision**: Was an architectural decision introduced? -> Create ADR in `docs/adr/`
5. **Public API**: Was the public API modified? -> Update `README.md` and effect docs
6. **Build outputs**: Were build outputs affected? -> Update `docs/diagrams/build-system.md`

## The Cardinal Rule

> If code and documentation disagree, the code is wrong until the documentation is updated via an explicit decision (ADR).

Documentation is prescriptive, not merely descriptive.

## What to Check

If `$ARGUMENTS` specifies a file or module, focus the audit there. Otherwise, perform a full sweep:

1. Read `docs/architecture.md` and verify the module map matches `src/`
2. Read each effect's docs and verify they match the current implementation
3. Read each diagram and verify it matches the current flow
4. Check that all ADRs are referenced in `docs/architecture.md`
5. Verify `README.md` reflects the current public API and usage examples

## Reporting

For each finding, report:
- **File**: the documentation file that needs updating
- **Issue**: what is stale or missing
- **Recommendation**: what should be changed
