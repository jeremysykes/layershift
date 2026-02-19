---
name: deploy-production
description: Production deployment workflow — build, test, preview, promote. Use when deploying to Vercel production or running preview deployments.
argument-hint: "[preview|production]"
allowed-tools: [Read, Glob, Grep, Bash]
---

# Deploy to Production

Execute the full deployment workflow for layershift.io on Vercel.

## Deployment Mode

- If `$ARGUMENTS` contains `preview` or is empty: deploy to preview only
- If `$ARGUMENTS` contains `production`: deploy preview first, then promote to production

## Deployment Checklist

Execute these steps in order. Stop on any failure.

### 1. Build Verification

```bash
npm run build && npm run build:component
```

Must pass with zero errors.

### 2. Test Gate

```bash
npm run test
```

Must pass — never deploy with failing tests.

### 3. Bundle Size Audit

Check `dist/components/layershift.js` gzipped size hasn't regressed unexpectedly.

### 4. Deploy Preview

```bash
npx vercel
```

Report the preview URL.

### 5. Verify Preview

- Confirm the preview loads correctly in browser
- Check that COOP and COEP headers are present:
  ```bash
  curl -I <preview-url>
  ```
- Verify required headers: `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy`

### 6. Promote to Production (if requested)

Only if `$ARGUMENTS` contains `production`:

```bash
npx vercel --prod
```

### 7. Verify Production

```bash
curl -I https://layershift.io
```

Confirm:
- Site loads at https://layershift.io
- COOP and COEP headers are present
- No redirect loops or DNS issues

## Incident Response

If production is broken after deployment:
- Check Vercel deployment logs: `npx vercel logs <deployment-url>`
- Roll back via Vercel dashboard or redeploy last known good commit
- Never force-push to main as a recovery mechanism
- Document the incident and root cause

## Performance Standards

- Landing page LCP: < 2.5s
- Component bundle (gzipped): < 150KB
- Time to interactive: < 3s on 4G
- No layout shift from component loading
