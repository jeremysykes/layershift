# Layershift — Agent Skills & Responsibilities

This document defines the specialized agent skills available in the project, their ownership boundaries, and escalation paths. It exists to prevent overlap, ensure accountability, and make it clear which skill to invoke for any given task.

## Skill Roster

| Skill | Domain | Owner of |
|-------|--------|----------|
| **senior-product-designer** | UX/UI decisions, layout, visual hierarchy | What to build and why (design rationale) |
| **ui-engineer** | React components, Tailwind, hooks, state | How to build the frontend (implementation) |
| **gpu-shader-engineer** | WebGL, GLSL, renderers, depth system | GPU pipeline, shaders, rendering correctness |
| **npm-package-engineer** | Package exports, versioning, bundling | npm publishing, build outputs, consumer DX |
| **production-engineer** | Deployment, Vercel, DNS, monitoring | Production releases, infrastructure, uptime |
| **qa-engineer** | Unit tests, E2E tests, regression | Test coverage, CI validation, quality gates |
| **technical-writer** | Docs, ADRs, diagrams, effect specs | Documentation accuracy, architecture prose |

## Ownership Boundaries

### Design vs Implementation (No Overlap)

The **senior-product-designer** decides *what* the UI should look like and *why*. The **ui-engineer** decides *how* to implement it. In practice:

- **Product designer** owns: layout decisions, spacing, color choices, interaction patterns, responsive breakpoints, visual hierarchy, component purpose.
- **UI engineer** owns: React component code, Tailwind classes, hook logic, state management, performance, accessibility implementation, component composition.
- **Handoff:** The product designer provides direction (e.g., "ghost button, centered at 62%, rgba(255,255,255,0.35) border"). The UI engineer implements it.

### GPU Pipeline vs Web Components (Clear Boundary)

- **GPU/shader engineer** owns: everything inside `parallax-renderer.ts`, `portal-renderer.ts`, `shape-generator.ts`, `depth-analysis.ts`, `depth-worker.ts`, `precomputed-depth.ts`. All GLSL code. All WebGL state management. Texture upload timing. Render loop architecture.
- **UI engineer** owns: `src/site/` (the React landing page). The `LayershiftEffect.tsx` bridge component.
- **Web Component lifecycle** (files in `src/components/layershift/`): The GPU/shader engineer owns the rendering internals. The UI engineer owns the attribute API surface and consumer-facing behavior. Both must coordinate on changes to the component interface.

### Documentation Ownership

- **Technical writer** owns: all files in `docs/`, all ADRs, all Mermaid diagrams, `README.md`.
- **Every other skill** is responsible for flagging when their work invalidates existing documentation. The technical writer then updates it.
- If code and documentation disagree, the code is wrong until the documentation is explicitly updated via ADR.

### Testing Ownership

- **QA engineer** owns: test infrastructure, test strategy, coverage thresholds, CI pipeline.
- **Every other skill** writes tests for their own code, but the QA engineer reviews them for completeness and correctness.
- The QA engineer is the final gate before any production release (in coordination with the production engineer).

### Release Pipeline

Releases involve a handoff chain:

1. **Feature skills** (ui-engineer, gpu-shader-engineer) complete their work.
2. **QA engineer** runs full test suite, verifies no regressions.
3. **Technical writer** ensures docs are updated.
4. **npm-package-engineer** handles version bump and npm publish.
5. **Production engineer** deploys to Vercel and verifies production.

## When to Invoke Each Skill

| Task | Invoke |
|------|--------|
| "Should we add a sticky nav?" | senior-product-designer |
| "Build the sticky nav component" | ui-engineer |
| "The parallax effect looks jittery" | gpu-shader-engineer |
| "Depth derivation formula needs tuning" | gpu-shader-engineer |
| "Publish version 0.3.0 to npm" | npm-package-engineer |
| "Deploy to production" | production-engineer |
| "Add E2E tests for the new effect" | qa-engineer |
| "Update architecture.md for the portal effect" | technical-writer |
| "Review this PR for test coverage" | qa-engineer |
| "Is the spacing between sections right?" | senior-product-designer |
| "Implement the spacing change" | ui-engineer |

## Escalation Rules

- If a task spans two skills, invoke the **primary** skill and let it request help from the secondary.
- If a design decision requires technical feasibility input, the product designer consults the ui-engineer or gpu-shader-engineer before finalizing.
- If a GPU change affects the Web Component API, the gpu-shader-engineer must coordinate with the ui-engineer.
- If a documentation update requires code changes, the technical writer creates an ADR and the relevant skill implements the change.

## Adding a New Skill

1. Create a directory at `.claude/skills/<skill-name>/`.
2. Write `SKILL.md` with the standard frontmatter (`name`, `description`, `argument-hint`).
3. Add the skill to the roster table in this file.
4. Define clear ownership boundaries — no overlap with existing skills.
5. Update the "When to Invoke" table with example tasks.
