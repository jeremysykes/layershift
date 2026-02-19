---
layout: doc
title: Documentation
---

# Layershift Documentation

Technical reference for the Layershift video effects library — architecture, effect specifications, design decisions, and system diagrams.

## Getting Started

- [System Architecture](./architecture.md) — module map, effect pipelines, build system
- [Parallax Effect](./parallax/depth-derivation-rules.md) — depth-derived parameter system and constraints
- [Portal Effect](./portal/portal-overview.md) — multi-pass stencil compositing and API reference

## Effect Documentation

### Parallax

The parallax effect uses depth maps to create motion-responsive 3D displacement.

- [Derivation Rules](./parallax/depth-derivation-rules.md) — inviolable system constraints
- [Analysis Skills](./parallax/depth-analysis-skills.md) — formal function specifications
- [Depth Architecture](./parallax/depth-derivation-architecture.md) — module boundaries and integration
- [Testability](./parallax/depth-derivation-testability.md) — testing strategy
- [Self-Audit](./parallax/depth-derivation-self-audit.md) — implementation verification

### Portal

The portal effect composites video through stencil-masked shapes with chamfer geometry and emissive lighting.

- [Portal Overview](./portal/portal-overview.md) — effect overview and full API reference
- [v2 Design](./portal/portal-v2-design.md) — historical dual-scene compositing design
- [v3 Dimensional Typography](./portal/portal-v3-dimensional-typography.md) — historical JFA distance field design

## System Diagrams

Visual specifications for data flow, lifecycle, and pipeline architecture.

- [System Architecture](./diagrams/system-architecture.md)
- [Parallax Initialization](./diagrams/parallax-initialization.md)
- [Parallax Render Loop](./diagrams/parallax-render-loop.md)
- [Portal Initialization](./diagrams/portal-initialization.md)
- [Portal Render Pipeline](./diagrams/portal-render-pipeline.md)
- [Depth Parameter Derivation](./diagrams/depth-parameter-derivation.md)
- [Depth Precompute Pipeline](./diagrams/depth-precompute-pipeline.md)
- [Build System](./diagrams/build-system.md)

## Architecture Decision Records

- [ADR-001: Depth-Derived Parallax Tuning](./adr/ADR-001-depth-derived-parallax-tuning.md)
- [ADR-002: WebGL Rendering Approach](./adr/ADR-002-webgl-rendering-approach.md)
- [ADR-003: Staging Preview Deployment](./adr/ADR-003-staging-preview-deployment-workflow.md)
- [ADR-004: Three.js to Pure WebGL 2](./adr/ADR-004-threejs-to-pure-webgl-migration.md)
- [ADR-005: Logo Depth Portal Effect](./adr/ADR-005-logo-depth-portal-effect.md)
- [ADR-006: Portal v4 Emissive Chamfer](./adr/ADR-006-portal-v4-emissive-chamfer-nesting.md)
- [ADR-007: VitePress Documentation Wiki](./adr/ADR-007-vitepress-documentation-wiki.md)
