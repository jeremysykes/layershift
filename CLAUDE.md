# Layershift — Project Rules

Layershift is a video effects library. Each effect ships as a self-contained Web Component. Parallax (`<layershift-parallax>`) is the first effect; more effects will follow. Documentation and architecture must accommodate this multi-effect trajectory.

## AI Control Plane

The `.claude/` directory is the AI governance layer for this project:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Agents** | `.claude/agents/*.md` | Subagent definitions — specialized roles with isolated context and tool restrictions |
| **Skills** | `.claude/skills/*/SKILL.md` | Reusable procedures invocable as `/slash-commands` |
| **Governance** | `.claude/governance/orchestration.md` | Task routing, ownership boundaries, escalation rules, release pipeline |
| **Standards** | `.claude/standards/invariants.md` | Project-wide inviolable constraints |

See `.claude/governance/orchestration.md` for role assignments, task routing, and escalation.
See `.claude/standards/invariants.md` for constraints that all agents and skills must respect.

## Documentation-First Development

All agents (human and AI) must consult and maintain project documentation at every step.

### Before Starting Work

1. **Read `docs/architecture.md`** to understand the library structure, module boundaries, and effect architecture.
2. **Read relevant effect docs** in `docs/<effect>/` for the effect you are modifying (e.g., `docs/parallax/` for the parallax effect).
3. **Read relevant diagrams** in `docs/diagrams/` — these are the authoritative visual specifications for data flow, lifecycle, and system structure.
4. **Check effect-specific rules** (e.g., `docs/parallax/depth-derivation-rules.md`) before modifying any effect's analysis or parameter system. Rules files contain inviolable constraints.

### During Work

5. **Respect documented constraints.** If a document says a value is constant (e.g., pomSteps=16), do not change it without updating the documentation and creating an ADR.
6. **Follow override precedence.** Configuration merging is: explicit config > derived params > calibrated defaults. Do not bypass this.
7. **Preserve calibration identities.** Any change to derivation formulas must maintain the invariant that calibration-point inputs produce exact current defaults. Verify algebraically.

### After Work

8. **Update `docs/architecture.md`** if you added, removed, or renamed any module, added a new effect, changed the rendering pipeline, modified the build system, or altered the public API.
9. **Update effect docs** if you changed behavior documented in `docs/<effect>/`.
10. **Update diagrams** in `docs/diagrams/` if you changed any flow, lifecycle, or structural relationship they depict.
11. **Create a new ADR** in `docs/adr/` for any architectural decision: new effects, new modules, changed interfaces, new dependencies, altered rendering pipeline, or changed build outputs.
12. **Update the self-audit** for the relevant effect if you modified its analysis, shader uniforms, or parameter derivation.

### Documentation Maintenance Rules

- Documentation is a first-class deliverable, not an afterthought.
- If code and documentation disagree, the code is wrong until the documentation is updated via an explicit decision (ADR).
- Stale documentation is a bug. Fix it immediately.
- Do not add effects, modules, or interfaces without corresponding documentation updates.
- Diagrams in `docs/diagrams/` are the authoritative visual specification. When a diagram and prose conflict, update the prose to match the diagram (or update both via ADR).

## Adding a New Effect

When adding a new effect to the library:

1. Create a new Web Component in `src/components/layershift/` (e.g., `<layershift-neweffect>`).
2. Create a new effect documentation directory at `docs/<effect>/`.
3. Add relevant Mermaid diagrams to `docs/diagrams/`.
4. Create an ADR in `docs/adr/` documenting the effect's design decisions.
5. Update `docs/architecture.md` with the new effect's module map and pipeline.
6. Update `docs/diagrams/system-architecture.md` to include the new effect.
7. Shared infrastructure (depth system, input handling, video loading) should be reused, not duplicated.

## Project Structure

```
src/
  components/layershift/    Web Components + framework wrappers
  site/                     Landing page
    components/             React UI (atomic design)
      atoms/                Smallest building blocks (Button, CodeBlock, etc.)
      molecules/            Composed from atoms (Tabs, EffectSelector, etc.)
      organisms/            Complex sections (Hero, StickyNav, Footer, etc.)
      templates/            Page-level wrappers (Content, RevealSection)
      index.ts              Root barrel re-exporting all components
  parallax-renderer.ts      Parallax effect GPU pipeline (multi-pass)
  webgl-utils.ts            Shared WebGL 2 helpers (compile, link, VAO)
  depth-analysis.ts         Parallax depth-adaptive parameter derivation
  precomputed-depth.ts      Binary depth loading + keyframe interpolation
  input-handler.ts          Mouse/gyro input (shared)
  config.ts                 Demo app config
  main.ts                   Demo app entry point
  video-source.ts           Video utilities (shared)
  ui.ts                     Loading UI
docs/
  architecture.md           System architecture (read first)
  adr/                      Architecture Decision Records
  diagrams/                 Mermaid diagrams (authoritative visual specs)
  parallax/                 Parallax effect subsystem docs
scripts/
  precompute-depth.ts       Depth map generation from video
  package-output.ts         Bundle packaging
.storybook/                 Storybook config (main, preview, manager, decorators)
```

## Build Commands

- `npm run dev` — Dev server
- `npm run build` — Build landing page
- `npm run build:component` — Build Web Component IIFE bundle
- `npm run build:storybook` — Build Storybook static site
- `npm run storybook` — Storybook dev server
- `npm run test` — Unit tests (Vitest)
- `npm run test:e2e` — E2E tests (Playwright)

## Key Constraints

> Full constraints are in `.claude/standards/invariants.md`. Summary below for quick reference.

- **Zero per-frame overhead** from depth analysis. Analysis runs once at init.
- **pomSteps is constant at 16.** Never derived or varied automatically.
- **All shader parameters are overrideable.** Optional fields in ParallaxRendererConfig, never enforced.
- **Depth values 0-255 are all valid.** No sentinel exclusion.
- **Deterministic outputs.** Same depth input always produces same derived parameters.
