# Rack Focus — Render Pipeline

4-pass GPU pipeline for depth-aware bokeh blur. Two decoupled loops share the same architecture as parallax and portal effects.

## Pipeline Overview

```mermaid
graph LR
    subgraph "RVFC Loop (~5fps)"
        A[Raw Depth R8] --> B[Bilateral Filter]
        B --> C[Filtered Depth R8]
    end

    subgraph "RAF Loop (60-120fps)"
        C --> D[CoC Computation]
        F[Focus State] --> D
        D --> E[Signed CoC R16F]

        V[Video Frame RGBA8] --> G[Poisson DOF Blur]
        E --> G
        G --> H[Blurred Color RGBA8]

        V --> I[Composite]
        H --> I
        E --> I
        I --> J[Canvas Output]
    end
```

## Pass Details

### Pass 1: Bilateral Filter (RVFC rate)

```mermaid
graph LR
    RD[Raw Depth Uint8] -->|texSubImage2D| T3[Texture UNIT 3]
    T3 --> BF[Bilateral Filter Shader]
    BF -->|FBO| T1[Filtered Depth UNIT 1]
```

Edge-preserving depth smoothing. Reuses the same bilateral shader source from the parallax effect. Quality-tiered kernel radius: 5x5 (high/medium) or 3x3 (low).

### Pass 2: CoC Computation (RAF rate)

```mermaid
graph LR
    T1[Filtered Depth UNIT 1] --> COC[CoC Fragment Shader]
    FS[Focus State] -->|uniforms| COC
    COC -->|FBO R16F| T2[CoC Texture UNIT 2]
```

Computes signed Circle of Confusion per pixel:
- Reads focal depth, aperture, focus range, depth scale from uniforms (updated per-frame from spring)
- Applies focus breathing UV modification during transitions
- Outputs signed value: negative = foreground, positive = background, zero = in-focus

### Pass 3: Poisson DOF Blur (RAF rate)

```mermaid
graph LR
    T0[Video UNIT 0] --> DOF[Poisson Blur Shader]
    T2[CoC UNIT 2] --> DOF
    DOF -->|FBO RGBA8| T4[Blurred UNIT 4]
```

Poisson disc bokeh blur with depth-aware weighting:
- Sample count: 48 (high) / 32 (medium) / 16 (low) via compile-time define
- Blur radius scaled by per-pixel CoC magnitude
- Background-on-foreground bleeding prevention (smoothstep + 0.25 suppression)
- Highlight bloom: luminance above threshold gets boosted weight
- **UV spaces**: Video sampled at cover-fit UVs (`vUv`), CoC FBO sampled at screen UVs (`vScreenUv`)

### Pass 4: Composite (RAF rate)

```mermaid
graph LR
    T0[Video UNIT 0] --> COMP[Composite Shader]
    T4[Blurred UNIT 4] --> COMP
    T2[CoC UNIT 2] --> COMP
    COMP --> CANVAS[Canvas]
```

Final output:
- Smooth blend between sharp and blurred via `smoothstep(0.5, 2.0, |CoC|)`
- Static vignette darkening at frame edges
- **UV spaces**: Video sampled at cover-fit UVs (`vUv`), blurred FBO and CoC FBO sampled at screen UVs (`vScreenUv`)

## Focus Input Flow

```mermaid
graph TD
    P[Pointer/Touch Events] -->|sample depth at UV| FIH[FocusInputHandler]
    S[Scroll Events] -->|viewport position| FIH
    API[JS API] -->|setFocusDepth| FIH

    FIH -->|spring target| SPR[Critically-Damped Spring]
    SPR -->|tick per RAF| FS[FocusState]

    FS -->|focalDepth| COC[CoC Pass Uniforms]
    FS -->|breathScale, breathOffset| COC
```

## Texture Unit Map

| Unit | Name | Format | Purpose |
|------|------|--------|---------|
| 0 | video | RGBA8 | Current video/image frame |
| 1 | filteredDepth | R8 | Bilateral-filtered depth map |
| 2 | coc | R16F | Signed Circle of Confusion |
| 3 | rawDepth | R8 | Raw depth (bilateral input) |
| 4 | blurred | RGBA8 | DOF-blurred color result |
