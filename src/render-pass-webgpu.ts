/**
 * WebGPU Render Pass Framework — pipeline and bind group management.
 *
 * Parallel to `render-pass.ts` (WebGL2) but with idiomatic WebGPU patterns:
 * - Pipeline state objects bake blend/stencil/depth config at creation
 * - Bind groups replace individual uniform calls
 * - No mutable state machine
 *
 * @see render-pass.ts for the WebGL2 counterpart.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single WebGPU render pass with its pipeline and bind group layout. */
export interface WebGPURenderPass {
  readonly name: string;
  readonly pipeline: GPURenderPipeline;
  readonly bindGroupLayout: GPUBindGroupLayout;
  dispose(): void;
}

/** A WebGPU render pass that outputs to an offscreen texture. */
export interface WebGPUFBOPass extends WebGPURenderPass {
  outputTexture: GPUTexture;
  outputView: GPUTextureView;
  width: number;
  height: number;
  resize(device: GPUDevice, w: number, h: number, format?: GPUTextureFormat): void;
}

/** Configuration for creating a WebGPU render pass. */
export interface WebGPURenderPassConfig {
  readonly name: string;
  readonly vertexShader: string;
  readonly fragmentShader: string;
  readonly vertexBufferLayouts: GPUVertexBufferLayout[];
  readonly colorTargets: GPUColorTargetState[];
  readonly depthStencil?: GPUDepthStencilState;
  readonly primitive?: GPUPrimitiveState;
  /** Explicit bind group layout entries. If omitted, uses auto layout. */
  readonly bindGroupLayoutEntries?: GPUBindGroupLayoutEntry[];
}

/** Configuration for creating a WebGPU FBO pass. */
export interface WebGPUFBOPassConfig extends WebGPURenderPassConfig {
  readonly outputWidth: number;
  readonly outputHeight: number;
  readonly outputFormat?: GPUTextureFormat;
}

// ---------------------------------------------------------------------------
// Pass creation
// ---------------------------------------------------------------------------

/**
 * Create a WebGPU render pass with explicit bind group layout.
 */
export function createWebGPUPass(
  device: GPUDevice,
  config: WebGPURenderPassConfig
): WebGPURenderPass {
  const bindGroupLayout = device.createBindGroupLayout({
    entries: config.bindGroupLayoutEntries ?? [],
  });

  const pipelineLayout = device.createPipelineLayout({
    bindGroupLayouts: [bindGroupLayout],
  });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module: device.createShaderModule({ code: config.vertexShader }),
      entryPoint: 'vs_main',
      buffers: config.vertexBufferLayouts,
    },
    fragment: {
      module: device.createShaderModule({ code: config.fragmentShader }),
      entryPoint: 'fs_main',
      targets: config.colorTargets,
    },
    primitive: config.primitive ?? {
      topology: 'triangle-strip',
      stripIndexFormat: 'uint16',
    },
    depthStencil: config.depthStencil,
  });

  return {
    name: config.name,
    pipeline,
    bindGroupLayout,
    dispose() {
      // WebGPU pipelines are GC'd — no explicit destroy needed.
      // This method exists for interface parity with WebGL2.
    },
  };
}

/**
 * Create a WebGPU FBO pass that renders to an offscreen texture.
 */
export function createWebGPUFBOPass(
  device: GPUDevice,
  config: WebGPUFBOPassConfig
): WebGPUFBOPass {
  const basePass = createWebGPUPass(device, config);
  const format = config.outputFormat ?? 'rgba8unorm';

  let outputTexture = createOutputTexture(device, config.outputWidth, config.outputHeight, format);
  let outputView = outputTexture.createView();

  return {
    ...basePass,
    outputTexture,
    outputView,
    width: config.outputWidth,
    height: config.outputHeight,
    resize(dev: GPUDevice, w: number, h: number, fmt?: GPUTextureFormat) {
      outputTexture.destroy();
      const f = fmt ?? format;
      outputTexture = createOutputTexture(dev, w, h, f);
      outputView = outputTexture.createView();
      this.outputTexture = outputTexture;
      this.outputView = outputView;
      this.width = w;
      this.height = h;
    },
    dispose() {
      outputTexture.destroy();
      basePass.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Texture management
// ---------------------------------------------------------------------------

/**
 * Shared texture registry for WebGPU — manages texture unit allocation.
 *
 * Unlike WebGL2, WebGPU doesn't have numbered texture units. Instead,
 * textures are referenced by bind group entries. This registry provides
 * a consistent naming scheme across passes.
 */
export class WebGPUTextureRegistry {
  private readonly textures = new Map<string, { texture: GPUTexture; view: GPUTextureView }>();

  register(name: string, texture: GPUTexture): GPUTextureView {
    const view = texture.createView();
    this.textures.set(name, { texture, view });
    return view;
  }

  get(name: string): { texture: GPUTexture; view: GPUTextureView } | undefined {
    return this.textures.get(name);
  }

  dispose(): void {
    for (const { texture } of this.textures.values()) {
      texture.destroy();
    }
    this.textures.clear();
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createOutputTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat
): GPUTexture {
  return device.createTexture({
    size: [width, height],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
}

// ---------------------------------------------------------------------------
// Common vertex buffer layouts
// ---------------------------------------------------------------------------

/** Fullscreen quad vertex buffer layout: position (vec2). */
export const FULLSCREEN_QUAD_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
  ],
};

/** Mesh vertex buffer layout: position (vec2) only. */
export const MESH_POSITION_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
  ],
};

/** Boundary vertex buffer layout: position (vec2) + normal (vec2). */
export const BOUNDARY_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 16,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
    { shaderLocation: 1, offset: 8, format: 'float32x2' },
  ],
};

/** Chamfer vertex buffer layout: position (vec2) + normal3 (vec3) + lerpT (float). */
export const CHAMFER_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 24,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
    { shaderLocation: 1, offset: 8, format: 'float32x3' },
    { shaderLocation: 2, offset: 20, format: 'float32' },
  ],
};
