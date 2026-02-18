# System Architecture

High-level architecture of the Layershift video effects library.

## Library Structure

```mermaid
graph TD
    subgraph "Layershift Library"
        direction TB
        CORE["Core Infrastructure<br/><i>input, video, UI, build</i>"]
        DEPTH["Shared Depth System<br/><i>precomputed-depth, depth-worker</i>"]

        subgraph "Effects"
            PARALLAX["Parallax Effect<br/><code>&lt;layershift-parallax&gt;</code>"]
            FUTURE["Future Effects<br/><i>planned</i>"]
        end
    end

    CORE --> PARALLAX
    CORE --> FUTURE
    DEPTH --> PARALLAX
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
```

## Module Dependency Graph

```mermaid
graph TD
    MAIN["main.ts<br/><i>demo app</i>"]
    SITE["site/main.ts<br/><i>landing page</i>"]
    ELEMENT["layershift-element.ts<br/><i>Web Component</i>"]

    DA["depth-analysis.ts<br/><i>parameter derivation</i>"]
    PD["precomputed-depth.ts<br/><i>binary loading + interpolation</i>"]
    PR["parallax-renderer.ts<br/><i>GPU pipeline</i>"]
    DW["depth-worker.ts<br/><i>bilateral filter worker</i>"]
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

    ELEMENT --> DA
    ELEMENT --> PD
    ELEMENT --> PR

    PD --> DW

    SITE --> ELEMENT

    style DA fill:#e1f5fe
    style DW fill:#fff3e0
    style PR fill:#f3e5f5
```
