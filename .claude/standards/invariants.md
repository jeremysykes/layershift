# Layershift — Project Invariants

These are project-wide constraints that all agents and skills must respect. They cannot be violated without an explicit ADR and corresponding documentation update.

## Parallax Effect Constraints

Source of truth: `docs/parallax/depth-derivation-rules.md`

1. **pomSteps is constant at 16.** Never derived or varied automatically.
2. **Zero per-frame overhead from depth analysis.** Analysis runs once at init, never during render.
3. **All depth values 0-255 are valid.** No sentinel exclusion.
4. **Deterministic outputs.** Same depth input always produces same derived parameters.
5. **Override precedence**: explicit config > derived params > calibrated defaults.
6. **Calibration identity**: The "average scene" (effectiveRange=0.50, bimodality=0.40) must produce exact current defaults. Verify algebraically after any formula change.
7. **All shader parameters are overrideable.** Optional fields in config, never enforced.

## Documentation Invariants

1. **Documentation is prescriptive.** If code and documentation disagree, the code is wrong until the documentation is updated via an explicit ADR.
2. **Diagrams are authoritative.** When a Mermaid diagram and prose conflict, update the prose to match the diagram (or update both via ADR).
3. **Stale documentation is a bug.** Fix it immediately.

## CSS Invariants

1. **Never use `!important`.** Not in stylesheets, not in Tailwind's `!` modifier, not in inline overrides. If a style needs to be overridden, fix the root cause — add a prop, restructure the cascade, or refactor the component. `!important` is a hack that masks architectural problems.
2. **Fix root causes, not symptoms.** When a component's styles don't compose well, refactor the component's API (add a prop, accept a className slot, etc.) rather than forcing overrides from the outside.

## Architecture Invariants

1. **Each effect is a self-contained Web Component.** Effects ship as `<layershift-*>` custom elements.
2. **Shared infrastructure is reused, not duplicated.** Depth system, input handling, video loading are common across effects.
3. **Build outputs are deterministic.** Same source always produces same bundles.

## Modification Protocol

To change any invariant:
1. Create an ADR documenting the change and its rationale (`/create-adr`).
2. Update this file.
3. Update any effect-specific rules files (e.g., `docs/parallax/depth-derivation-rules.md`).
4. Update relevant agent definitions if affected.
