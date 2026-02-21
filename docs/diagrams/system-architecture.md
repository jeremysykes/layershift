# System Architecture

High-level architecture of the Layershift video effects library.

## Library Structure

```mermaid
graph TD
    subgraph "Layershift Library"
        direction TB
        CORE["Core Infrastructure<br/><i>input, video, UI, build</i>"]
        DEPTH["Shared Depth System<br/><i>precomputed-depth</i>"]

        subgraph "Effects"
            PARALLAX["Parallax Effect<br/><code>&lt;layershift-parallax&gt;</code>"]
            PORTAL["Portal Effect<br/><code>&lt;layershift-portal&gt;</code>"]
            RACKFOCUS["Rack Focus Effect<br/><code>&lt;layershift-rack-focus&gt;</code>"]
            FUTURE["Future Effects<br/><i>planned</i>"]
        end
    end

    CORE --> PARALLAX
    CORE --> PORTAL
    CORE --> RACKFOCUS
    CORE --> FUTURE
    DEPTH --> PARALLAX
    DEPTH --> PORTAL
    DEPTH --> RACKFOCUS
    DEPTH --> FUTURE

    subgraph "Consumers"
        HTML["HTML / Vanilla JS"]
        REACT["React"]
        VUE["Vue"]
        SVELTE["Svelte"]
        ANGULAR["Angular"]
    end

    PARALLAX --> HTML
    PARALLAX --> REACT
    PARALLAX --> VUE
    PARALLAX --> SVELTE
    PARALLAX --> ANGULAR

    PORTAL --> HTML
    PORTAL --> REACT
    PORTAL --> VUE
    PORTAL --> SVELTE
    PORTAL --> ANGULAR

    RACKFOCUS --> HTML
    RACKFOCUS --> REACT
    RACKFOCUS --> VUE
    RACKFOCUS --> SVELTE
    RACKFOCUS --> ANGULAR
```

## Module Dependency Graph

```mermaid
graph TD
    MAIN["main.ts<br/><i>demo app</i>"]
    SITE["site/main.ts<br/><i>landing page</i>"]
    ELEMENT["layershift-element.ts<br/><i>Parallax Web Component</i>"]
    PORTAL_EL["portal-element.ts<br/><i>Portal Web Component</i>"]
    RF_EL["rack-focus-element.ts<br/><i>Rack Focus Web Component</i>"]

    GB["gpu-backend.ts<br/><i>WebGPU vs WebGL 2 detection</i>"]
    FIH["focus-input-handler.ts<br/><i>spring focus input</i>"]
    RB["renderer-base.ts<br/><i>abstract renderer base</i>"]
    DA["depth-analysis.ts<br/><i>parameter derivation</i>"]
    PD["precomputed-depth.ts<br/><i>binary loading + interpolation</i>"]
    JFA["jfa-distance-field.ts<br/><i>JFA orchestration</i>"]

    subgraph "WebGL 2 Backend"
        PR["parallax-renderer.ts<br/><i>WebGL 2 parallax</i>"]
        PTR["portal-renderer.ts<br/><i>WebGL 2 portal</i>"]
        RFR["rack-focus-renderer.ts<br/><i>WebGL 2 rack focus</i>"]
        RP["render-pass.ts<br/><i>WebGL 2 pass framework</i>"]
        WU["webgl-utils.ts<br/><i>WebGL 2 helpers</i>"]
    end

    subgraph "WebGPU Backend"
        PR_GPU["parallax-renderer-webgpu.ts<br/><i>WebGPU parallax</i>"]
        PTR_GPU["portal-renderer-webgpu.ts<br/><i>WebGPU portal</i>"]
        RFR_GPU["rack-focus-renderer-webgpu.ts<br/><i>WebGPU rack focus</i>"]
        RP_GPU["render-pass-webgpu.ts<br/><i>WebGPU pass framework</i>"]
        WU_GPU["webgpu-utils.ts<br/><i>WebGPU helpers</i>"]
    end

    QS["quality.ts<br/><i>adaptive quality scaling</i>"]
    SG["shape-generator.ts<br/><i>SVG → GPU mesh</i>"]
    IH["input-handler.ts<br/><i>mouse / gyro</i>"]
    VS["video-source.ts<br/><i>video element</i>"]
    UI["ui.ts<br/><i>loading overlay</i>"]
    CFG["config.ts<br/><i>demo config</i>"]

    MAIN --> DA
    MAIN --> PD
    MAIN --> PR
    MAIN --> IH
    MAIN --> VS
    MAIN --> UI
    MAIN --> CFG

    ELEMENT --> GB
    ELEMENT --> DA
    ELEMENT --> PD
    ELEMENT --> PR
    ELEMENT --> PR_GPU

    PORTAL_EL --> GB
    PORTAL_EL --> PD
    PORTAL_EL --> PTR
    PORTAL_EL --> PTR_GPU
    PORTAL_EL --> SG

    RF_EL --> GB
    RF_EL --> DA
    RF_EL --> PD
    RF_EL --> RFR
    RF_EL --> RFR_GPU
    RF_EL --> FIH

    PR --> RB
    PR --> RP
    PR --> QS
    PR --> WU

    PTR --> RB
    PTR --> RP
    PTR --> QS
    PTR --> WU
    PTR --> JFA

    PR_GPU --> RB
    PR_GPU --> RP_GPU
    PR_GPU --> QS
    PR_GPU --> WU_GPU

    PTR_GPU --> RB
    PTR_GPU --> RP_GPU
    PTR_GPU --> QS
    PTR_GPU --> WU_GPU
    PTR_GPU --> JFA

    RFR --> RB
    RFR --> RP
    RFR --> QS
    RFR --> WU

    RFR_GPU --> RB
    RFR_GPU --> RP_GPU
    RFR_GPU --> QS
    RFR_GPU --> WU_GPU

    SITE --> ELEMENT
    SITE --> PORTAL_EL
    SITE --> RF_EL

    style DA fill:#e1f5fe
    style PR fill:#f3e5f5
    style PTR fill:#f3e5f5
    style PR_GPU fill:#f3e5f5
    style PTR_GPU fill:#f3e5f5
    style RP fill:#fff3e0
    style QS fill:#fff3e0
    style WU fill:#fff3e0
    style RP_GPU fill:#fff3e0
    style WU_GPU fill:#fff3e0
    style RB fill:#fff3e0
    style GB fill:#fff3e0
    style JFA fill:#fff3e0
    style SG fill:#e8f5e9
    style RFR fill:#f3e5f5
    style RFR_GPU fill:#f3e5f5
    style FIH fill:#e1f5fe
```
