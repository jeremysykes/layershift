# Layershift — Orchestration

This document describes how work is orchestrated in the project: specialized roles, ownership boundaries, and how to route tasks. Use it to assign work, avoid overlap, and know who owns what. It applies to both human contributors and AI assistants.

## Architecture

The AI control plane uses three distinct layers:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Agents** | `.claude/agents/*.md` | Specialized subagents with isolated context, tool restrictions, and domain ownership |
| **Skills** | `.claude/skills/*/SKILL.md` | Reusable procedures invocable as `/slash-commands` by agents or users |
| **Governance** | `.claude/governance/` | Orchestration rules, routing, escalation (this file) |
| **Standards** | `.claude/standards/` | Project-wide invariants and constraints |

Agents are identities with judgment and scope. Skills are procedures without identity. Agents preload relevant skills via frontmatter.

## Role Roster

| Role | Agent File | Preloaded Skills | Domain |
|------|-----------|-----------------|--------|
| **senior-product-designer** | `agents/senior-product-designer.md` | — | UX/UI decisions, layout, visual hierarchy |
| **ui-engineer** | `agents/ui-engineer.md` | — | React components, Tailwind, hooks, state |
| **gpu-shader-engineer** | `agents/gpu-shader-engineer.md` | — | WebGL, GLSL, renderers, depth system |
| **npm-package-engineer** | `agents/npm-package-engineer.md` | `publish-npm` | npm publishing, build outputs, consumer DX |
| **production-engineer** | `agents/production-engineer.md` | `deploy-production` | Deployment, Vercel, DNS, monitoring |
| **qa-engineer** | `agents/qa-engineer.md` | `run-tests` | Test coverage, CI validation, quality gates |
| **technical-writer** | `agents/technical-writer.md` | `create-adr`, `audit-docs` | Documentation accuracy, architecture prose |

## Tool Authorization

Each agent declares its allowed tools in frontmatter. This matrix summarizes access:

| Agent | Read/Write/Edit | Bash | Task | Restricted From |
|-------|----------------|------|------|-----------------|
| gpu-shader-engineer | Yes | Yes | Yes | — |
| ui-engineer | Yes | Yes | Yes | — |
| qa-engineer | Yes | Yes | Yes | — |
| npm-package-engineer | Yes | Yes | Yes | — |
| production-engineer | Yes | Yes | Yes | — |
| technical-writer | Yes | Yes | No | Task (delegates to skills instead) |
| senior-product-designer | Read only | Yes | No | Write, Edit (proposes, doesn't implement) |

## Ownership Boundaries

### Design vs Implementation (No Overlap)

The **senior-product-designer** decides *what* the UI should look like and *why*. The **ui-engineer** decides *how* to implement it.

- **Product designer** owns: layout decisions, spacing, color choices, interaction patterns, responsive breakpoints, visual hierarchy, component purpose.
- **UI engineer** owns: React component code, Tailwind classes, hook logic, state management, performance, accessibility implementation, component composition.
- **Handoff:** The product designer provides direction (e.g., "ghost button, centered at 62%, rgba(255,255,255,0.35) border"). The UI engineer implements it.

### GPU Pipeline vs Web Components (Clear Boundary)

- **GPU/shader engineer** owns: everything inside `parallax-renderer.ts`, `portal-renderer.ts`, `shape-generator.ts`, `depth-analysis.ts`, `precomputed-depth.ts`. All GLSL code. All WebGL state management. Texture upload timing. Render loop architecture.
- **UI engineer** owns: `src/site/` (the React landing page). The `LayershiftEffect.tsx` bridge component.
- **Web Component lifecycle** (files in `src/components/layershift/`): The GPU/shader engineer owns the rendering internals. The UI engineer owns the attribute API surface and consumer-facing behavior. Both must coordinate on changes to the component interface.

### Documentation Ownership

- **Technical writer** owns: all files in `docs/`, all ADRs, all Mermaid diagrams, `README.md`.
- **Every other role** is responsible for flagging when their work invalidates existing documentation. The technical writer then updates it.
- If code and documentation disagree, the code is wrong until the documentation is explicitly updated via ADR.

### Testing Ownership

- **QA engineer** owns: test infrastructure, test strategy, coverage thresholds, CI pipeline.
- **Every other role** writes tests for their own code, but the QA engineer reviews them for completeness and correctness.
- The QA engineer is the final gate before any production release (in coordination with the production engineer).

### Release Pipeline

Releases follow this handoff chain:

1. **Feature roles** (ui-engineer, gpu-shader-engineer) complete their work.
2. **QA engineer** runs full test suite, verifies no regressions (`/run-tests all`).
3. **Technical writer** ensures docs are updated (`/audit-docs`).
4. **npm-package-engineer** handles version bump and npm publish (`/publish-npm`).
5. **Production engineer** deploys to Vercel and verifies production (`/deploy-production production`).

## Task Routing

| Task | Route to Agent |
|------|---------------|
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

- If a task spans two roles, assign the **primary** agent and have it pull in the secondary as needed.
- If a design decision needs technical feasibility input, the product designer consults the ui-engineer or gpu-shader-engineer before finalizing.
- If a GPU change affects the Web Component API, the gpu-shader-engineer must coordinate with the ui-engineer.
- If a documentation update requires code changes, the technical writer creates an ADR (`/create-adr`) and the relevant role implements the change.

## Precedence

When rules conflict, resolve in this order (highest wins):

1. **`.claude/standards/invariants.md`** — inviolable project constraints
2. **Agent scope** (`.claude/agents/*.md`) — domain-specific rules and ownership
3. **`CLAUDE.md`** — documentation-first governance workflow
4. **This file** — routing, escalation, handoff

## Adding a New Role

1. Create a subagent file at `.claude/agents/<role-name>.md` with proper frontmatter (`name`, `description`, `tools`, `model`).
2. If the role has reusable procedures, extract them as skills in `.claude/skills/<skill-name>/SKILL.md`.
3. Reference skills in the agent's `skills` frontmatter field.
4. Add the role to the roster table in this file.
5. Define clear ownership boundaries — no overlap with existing roles.
6. Add example tasks to the "Task Routing" table.
