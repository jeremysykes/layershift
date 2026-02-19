# Portal Effect — Initialization Lifecycle

Initialization sequence for the `<layershift-portal>` Web Component.

```mermaid
sequenceDiagram
    participant App as connectedCallback
    participant Video as Video Source
    participant Depth as Depth Loader
    participant SVG as Shape Generator
    participant Worker as Depth Worker
    participant Renderer as Portal Renderer

    App->>+Video: createVideoElement(src)
    App->>+Depth: loadPrecomputedDepth(bin, meta)
    App->>+SVG: generateMeshFromSVG(logoSrc)

    Note over Video,SVG: Parallel asset loading

    Video-->>-App: <video> element
    Depth-->>-App: { frames: Uint8Array[], meta }
    SVG-->>-App: ShapeMesh { vertices, indices,<br/>edgeVertices, contourOffsets,<br/>contourIsHole }

    Note over SVG: Nesting-based hole detection:<br/>classifyContoursByNesting() uses<br/>geometric containment depth,<br/>not winding direction

    App->>+Worker: WorkerDepthInterpolator.create(depthData)
    Worker-->>-App: interpolator ready

    Note over App,Worker: Falls back to sync DepthFrameInterpolator<br/>if Worker unavailable

    App->>+Renderer: new PortalRenderer(config)
    App->>Renderer: initialize(video, w, h, mesh)

    Note right of Renderer: GPU Resource Setup:
    Note right of Renderer: 1. WebGL 2 context (stencil: true)
    Note right of Renderer: 2. Compile 9 shader programs
    Note right of Renderer: 3. Logo mesh VBO + IBO (stencil + mask)
    Note right of Renderer: 4. Build + upload chamfer mesh VAO
    Note right of Renderer: 5. Edge mesh VBO (boundary pass)
    Note right of Renderer: 6. Full-screen quad VAO
    Note right of Renderer: 7. Interior FBO (MRT: color RGBA8 + depth R16F)
    Note right of Renderer: 8. JFA FBOs (mask R8, ping/pong RG16F, dist R16F)
    Note right of Renderer: 9. Video texture + depth texture
    Note right of Renderer: 10. Set static uniforms (config values)

    App->>Renderer: start(video, readDepth, readInput)
    Note right of Renderer: Registers RAF + RVFC loops
    Renderer-->>-App: rendering

    App->>App: Dispatch layershift-portal:ready
```

## Shader Programs (9 total)

| Program | Vertex | Fragment | Purpose |
|---------|--------|----------|---------|
| Stencil | STENCIL_VS | STENCIL_FS | Mark logo shape in stencil buffer |
| Mask | MASK_VS | MASK_FS | Render binary mask for JFA input |
| JFA Seed | JFA_SEED_VS | JFA_SEED_FS | Detect edges, write seed coordinates |
| JFA Flood | JFA_FLOOD_VS | JFA_FLOOD_FS | Jump flood iterations (ping-pong) |
| JFA Distance | JFA_DIST_VS | JFA_DIST_FS | Convert seed coords to scalar distance |
| Interior | INTERIOR_VS | INTERIOR_FS | POM + lens + DOF + fog + color grading → FBO |
| Composite | COMPOSITE_VS | COMPOSITE_FS | Emissive passthrough + edge occlusion |
| Chamfer | CHAMFER_VS | CHAMFER_FS | Geometric chamfer with Blinn-Phong + video blur |
| Boundary | BOUNDARY_VS | BOUNDARY_FS | Rim + refraction + chromatic + edge wall + occlusion |

## Geometry Buffers

| Buffer | Contents | Created |
|--------|----------|---------|
| Logo mesh VBO + IBO | Triangulated SVG (earcut), shared by stencil + mask | Once at init |
| Chamfer mesh VAO | Ring of quads around contours (6 floats/vert: x, y, nx, ny, nz, lerpT) | Once at init |
| Edge mesh VBO | Thick line quads along logo outline | Once at init |
| Full-screen quad VAO | 2-triangle quad for fullscreen passes | Once at init |

## FBO Allocation

| FBO | Attachments | Resolution | Purpose |
|-----|-------------|------------|---------|
| Interior FBO | Color (RGBA8) + Depth (R16F) | Canvas resolution | Off-screen interior scene |
| Mask FBO | Color (R8) | Half resolution | Binary mask for JFA |
| JFA Ping FBO | Color (RG16F) | Half resolution | Flood pass A |
| JFA Pong FBO | Color (RG16F) | Half resolution | Flood pass B |
| Distance FBO | Color (R16F) | Half resolution | Final distance field |
