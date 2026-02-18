# ADR-003: Staging via Vercel Preview Deployments

## Status

Accepted

## Date

2026-02-18

## Context

Previously, all commits to `main` were deployed directly to production via Vercel. As the library grows to include multiple effects, pushing untested changes live becomes increasingly risky — especially for GPU/shader work that behaves differently across devices and browsers.

## Decision

Adopt a **branch-based staging workflow** using Vercel's built-in preview deployments. All changes go through pull requests. Each PR receives a unique preview URL for testing before merging to `main` (production).

## Workflow

```
feature branch → PR → Vercel preview URL → review/test → merge to main → production
```

1. **Create a feature branch** from `main`
2. **Push and open a PR** — Vercel automatically deploys a preview at a unique URL
3. **Test the preview** — verify on desktop, mobile, different browsers
4. **Merge to `main`** — Vercel automatically deploys to production

## Branch Protection

`main` branch is protected with:
- Require pull request before merging (no direct pushes)
- Require Vercel deployment to succeed before merge

## Consequences

- No untested code reaches production
- Every PR is testable via a real URL (not just local dev)
- GPU/shader changes can be verified on actual devices before going live
- Slightly slower path to production (PR required), but the safety trade-off is worth it
- Vercel preview deployments are free and require no additional infrastructure
