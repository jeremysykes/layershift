/**
 * Parallax Renderer (WebGPU) — GPU-accelerated depth-aware video parallax.
 *
 * WebGPU counterpart to `parallax-renderer.ts` (WebGL2). Shares the same
 * `RendererBase` abstract base class and `ParallaxRendererConfig` interface.
 *
 * ## Pipeline
 *
 * 1. **Bilateral filter pass** — edge-preserving depth smoothing.
 *    Reads raw depth, writes filtered depth to offscreen r8unorm texture.
 *    Runs at RVFC rate (~5fps, only when depth data changes).
 *
 * 2. **Parallax pass** — per-pixel depth-based displacement.
 *    Reads video + filtered depth, renders to canvas swap chain texture.
 *    Runs at RAF rate (60-120fps).
 *
 * ## Key differences from WebGL2 version
 *
 * - Pipeline state objects bake all config at creation time
 * - Bind groups replace individual uniform calls
 * - Override constants replace #define injection
 * - `copyExternalImageToTexture` for zero-copy video frame import
 * - `writeTexture` for depth data upload
 */

import { RendererBase } from './renderer-base';
import type { ParallaxRendererConfig } from './parallax-renderer';
import type { MediaSource } from './media-source';
import { resolveQualityWebGPU } from './quality';
import {
  createFullscreenQuadBuffer,
  createUniformBuffer,
  createLinearSampler,
  importImageSource,
} from './webgpu-utils';
import { FULLSCREEN_QUAD_LAYOUT } from './render-pass-webgpu';

// ---------------------------------------------------------------------------
// WGSL Shaders (imported from external files via Vite ?raw)
// ---------------------------------------------------------------------------

import VERTEX_WGSL from './shaders/parallax/vertex.wgsl?raw';
import FRAGMENT_WGSL from './shaders/parallax/fragment.wgsl?raw';
import BILATERAL_VERTEX_WGSL from './shaders/parallax/bilateral-vertex.wgsl?raw';
import BILATERAL_FRAGMENT_WGSL from './shaders/parallax/bilateral-fragment.wgsl?raw';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Calibrated defaults for optional shader parameters. */
const SHADER_PARAM_DEFAULTS = {
  contrastLow: 0.05,
  contrastHigh: 0.95,
  verticalReduction: 0.5,
  dofStart: 0.6,
  dofStrength: 0.4,
} as const;

/** Spatial sigma² values indexed by bilateral radius. */
const SPATIAL_SIGMA2_BY_RADIUS: Record<number, number> = {
  2: 2.25,   // 1.5²
  1: 0.5625, // 0.75²
};

/** Compile-time upper bound for the POM for-loop. */
const MAX_POM_STEPS = 64;

// ---------------------------------------------------------------------------
// Resolved config (internal)
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  parallaxStrength: number;
  pomEnabled: boolean;
  pomSteps: number;
  overscanPadding: number;
  contrastLow: number;
  contrastHigh: number;
  verticalReduction: number;
  dofStart: number;
  dofStrength: number;
}

// ---------------------------------------------------------------------------
// Uniform buffer byte sizes (matching WGSL struct layouts)
// ---------------------------------------------------------------------------

/** Bilateral: texelSize(vec2f=8) + spatialSigma2(f32=4) = 12 → pad to 16. */
const BILATERAL_UNIFORM_SIZE = 16;

/** Vertex: uvOffset(vec2f=8) + uvScale(vec2f=8) = 16. */
const VERTEX_UNIFORM_SIZE = 16;

/**
 * Fragment:
 *   offset(vec2f=8) + strength(f32=4) + pomEnabled(u32=4) +
 *   pomSteps(i32=4) + contrastLow(f32=4) + contrastHigh(f32=4) +
 *   verticalReduction(f32=4) + dofStart(f32=4) + dofStrength(f32=4) +
 *   imageTexelSize(vec2f=8) = 48.
 */
const FRAGMENT_UNIFORM_SIZE = 48;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class ParallaxRendererWebGPU extends RendererBase {
  // ---- WebGPU core ----
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat;

  // ---- Config ----
  private readonly config: ResolvedConfig;

  // ---- Shared resources ----
  private quadBuffer: GPUBuffer | null = null;
  private linearSampler: GPUSampler | null = null;

  // ---- Bilateral filter pass ----
  private bilateralPipeline: GPURenderPipeline | null = null;
  private bilateralBindGroupLayout: GPUBindGroupLayout | null = null;
  private bilateralUniformBuffer: GPUBuffer | null = null;
  private bilateralBindGroup: GPUBindGroup | null = null;
  private rawDepthTexture: GPUTexture | null = null;
  private rawDepthView: GPUTextureView | null = null;

  // ---- Filtered depth (shared between passes) ----
  private filteredDepthTexture: GPUTexture | null = null;
  private filteredDepthView: GPUTextureView | null = null;

  // ---- Parallax pass ----
  private parallaxPipeline: GPURenderPipeline | null = null;
  private parallaxBindGroupLayout: GPUBindGroupLayout | null = null;
  private vertexUniformBuffer: GPUBuffer | null = null;
  private fragmentUniformBuffer: GPUBuffer | null = null;
  private parallaxBindGroup: GPUBindGroup | null = null;
  private videoTexture: GPUTexture | null = null;
  private videoTextureView: GPUTextureView | null = null;

  // ---- Per-frame scratch buffer ----
  private readonly offsetData = new Float32Array(2);

  // ---- Depth Y-flip buffer (WebGPU writeTexture has no flipY option) ----
  private depthFlipBuffer: Uint8Array | null = null;

  constructor(
    parent: HTMLElement,
    config: ParallaxRendererConfig,
    device: GPUDevice,
    adapterInfo: GPUAdapterInfo
  ) {
    super(parent);
    this.device = device;

    // Resolve config with defaults.
    this.config = {
      parallaxStrength: config.parallaxStrength,
      pomEnabled: config.pomEnabled,
      pomSteps: config.pomSteps,
      overscanPadding: config.overscanPadding,
      contrastLow: config.contrastLow ?? SHADER_PARAM_DEFAULTS.contrastLow,
      contrastHigh: config.contrastHigh ?? SHADER_PARAM_DEFAULTS.contrastHigh,
      verticalReduction: config.verticalReduction ?? SHADER_PARAM_DEFAULTS.verticalReduction,
      dofStart: config.dofStart ?? SHADER_PARAM_DEFAULTS.dofStart,
      dofStrength: config.dofStrength ?? SHADER_PARAM_DEFAULTS.dofStrength,
    };

    // Quality tier from device capabilities.
    this.qualityParams = resolveQualityWebGPU(adapterInfo, config.quality);

    // Configure canvas context.
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.canvasFormat,
      alphaMode: 'opaque',
    });

    // Shared resources.
    this.quadBuffer = createFullscreenQuadBuffer(device);
    this.linearSampler = createLinearSampler(device);

    // Create pipelines (bake all state at init time).
    this.createBilateralPipeline();
    this.createParallaxPipeline();

    // Allocate uniform buffers (contents updated per-frame or on resize).
    this.bilateralUniformBuffer = createUniformBuffer(device, BILATERAL_UNIFORM_SIZE);
    this.vertexUniformBuffer = createUniformBuffer(device, VERTEX_UNIFORM_SIZE);
    this.fragmentUniformBuffer = createUniformBuffer(device, FRAGMENT_UNIFORM_SIZE);

    // Handle device loss.
    device.lost.then((info) => {
      console.error(`WebGPU device lost (${info.reason}): ${info.message}`);
      this.stop();
    });

    this.setupResizeHandling();
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Set up textures, write static uniforms, and build bind groups.
   *
   * Call this once after the media source and depth data are loaded.
   */
  initialize(
    source: MediaSource,
    depthWidth: number,
    depthHeight: number
  ): void {
    this.disposeTextures();

    this.isCameraSource = source.type === 'camera';
    this.videoAspect = source.width / source.height;
    this.clampDepthDimensions(depthWidth, depthHeight, this.qualityParams.depthMaxDim);

    // ---- Video texture ----
    this.videoTexture = this.device.createTexture({
      size: [source.width, source.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.videoTextureView = this.videoTexture.createView();

    // ---- Raw depth texture (bilateral filter input) ----
    this.rawDepthTexture = this.device.createTexture({
      size: [this.depthWidth, this.depthHeight],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.rawDepthView = this.rawDepthTexture.createView();

    // ---- Filtered depth texture (bilateral output → parallax input) ----
    this.filteredDepthTexture = this.device.createTexture({
      size: [this.depthWidth, this.depthHeight],
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.filteredDepthView = this.filteredDepthTexture.createView();

    // ---- Depth Y-flip buffer ----
    this.depthFlipBuffer = new Uint8Array(this.depthWidth * this.depthHeight);

    // ---- Write bilateral static uniforms ----
    const spatialSigma2 = SPATIAL_SIGMA2_BY_RADIUS[this.qualityParams.bilateralRadius] ?? 2.25;
    this.device.queue.writeBuffer(
      this.bilateralUniformBuffer!,
      0,
      new Float32Array([
        1.0 / this.depthWidth,
        1.0 / this.depthHeight,
        spatialSigma2,
        0, // padding to 16 bytes
      ])
    );

    // ---- Write fragment static uniforms ----
    this.writeStaticFragmentUniforms(source.width, source.height);

    // ---- Rebuild bind groups (reference newly created textures) ----
    this.rebuildBilateralBindGroup();
    this.rebuildParallaxBindGroup();

    // Size to current viewport.
    this.recalculateViewportLayout();
  }

  // -----------------------------------------------------------------------
  // Pipeline creation
  // -----------------------------------------------------------------------

  private createBilateralPipeline(): void {
    const device = this.device;

    this.bilateralBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.bilateralBindGroupLayout],
    });

    this.bilateralPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: BILATERAL_VERTEX_WGSL }),
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: device.createShaderModule({ code: BILATERAL_FRAGMENT_WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: 'r8unorm' }],
        constants: {
          BILATERAL_RADIUS: this.qualityParams.bilateralRadius,
        },
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createParallaxPipeline(): void {
    const device = this.device;

    this.parallaxBindGroupLayout = device.createBindGroupLayout({
      entries: [
        // binding 0: vertex uniforms (uvOffset, uvScale)
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        // binding 1: fragment uniforms (offset, strength, POM params, DOF, texelSize)
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        // binding 2: image texture
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        // binding 3: image sampler
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        // binding 4: depth texture (filtered)
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        // binding 5: depth sampler
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      bindGroupLayouts: [this.parallaxBindGroupLayout],
    });

    this.parallaxPipeline = device.createRenderPipeline({
      layout: pipelineLayout,
      vertex: {
        module: device.createShaderModule({ code: VERTEX_WGSL }),
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: device.createShaderModule({ code: FRAGMENT_WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.canvasFormat }],
        constants: {
          MAX_POM_STEPS: MAX_POM_STEPS,
        },
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  // -----------------------------------------------------------------------
  // Bind groups
  // -----------------------------------------------------------------------

  private rebuildBilateralBindGroup(): void {
    if (
      !this.bilateralBindGroupLayout ||
      !this.bilateralUniformBuffer ||
      !this.rawDepthView ||
      !this.linearSampler
    ) return;

    this.bilateralBindGroup = this.device.createBindGroup({
      layout: this.bilateralBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bilateralUniformBuffer } },
        { binding: 1, resource: this.rawDepthView },
        { binding: 2, resource: this.linearSampler },
      ],
    });
  }

  private rebuildParallaxBindGroup(): void {
    if (
      !this.parallaxBindGroupLayout ||
      !this.vertexUniformBuffer ||
      !this.fragmentUniformBuffer ||
      !this.videoTextureView ||
      !this.filteredDepthView ||
      !this.linearSampler
    ) return;

    this.parallaxBindGroup = this.device.createBindGroup({
      layout: this.parallaxBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.vertexUniformBuffer } },
        { binding: 1, resource: { buffer: this.fragmentUniformBuffer } },
        { binding: 2, resource: this.videoTextureView },
        { binding: 3, resource: this.linearSampler },
        { binding: 4, resource: this.filteredDepthView },
        { binding: 5, resource: this.linearSampler },
      ],
    });
  }

  // -----------------------------------------------------------------------
  // Uniform helpers
  // -----------------------------------------------------------------------

  /** Write all static (non per-frame) fragment uniforms. */
  private writeStaticFragmentUniforms(videoWidth: number, videoHeight: number): void {
    const buf = new ArrayBuffer(FRAGMENT_UNIFORM_SIZE);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);
    const i32 = new Int32Array(buf);

    // offset.x, offset.y — updated per-frame, zeroed initially
    f32[0] = 0;
    f32[1] = 0;
    f32[2] = this.config.parallaxStrength;
    u32[3] = this.config.pomEnabled ? 1 : 0;
    i32[4] = this.config.pomSteps;
    f32[5] = this.config.contrastLow;
    f32[6] = this.config.contrastHigh;
    f32[7] = this.config.verticalReduction;
    f32[8] = this.config.dofStart;
    f32[9] = this.config.dofStrength;
    f32[10] = 1.0 / videoWidth;
    f32[11] = 1.0 / videoHeight;

    this.device.queue.writeBuffer(this.fragmentUniformBuffer!, 0, buf);
  }

  // -----------------------------------------------------------------------
  // Depth Y-flip
  // -----------------------------------------------------------------------

  /**
   * Flip depth data vertically to match video orientation.
   *
   * WebGPU `writeTexture` has no equivalent to WebGL's `UNPACK_FLIP_Y_WEBGL`.
   * Video frames are imported with `flipY: true` via `copyExternalImageToTexture`,
   * so depth data must also be flipped to maintain spatial alignment.
   */
  private flipDepthY(data: Uint8Array): Uint8Array {
    const buf = this.depthFlipBuffer!;
    const w = this.depthWidth;
    const h = this.depthHeight;
    for (let y = 0; y < h; y++) {
      const srcOffset = y * w;
      const dstOffset = (h - 1 - y) * w;
      buf.set(data.subarray(srcOffset, srcOffset + w), dstOffset);
    }
    return buf;
  }

  // -----------------------------------------------------------------------
  // Abstract method implementations
  // -----------------------------------------------------------------------

  /**
   * Main render loop — called every animation frame at display refresh rate.
   *
   * 1. Upload current video frame to GPU texture.
   * 2. Update parallax offset from input (buttery smooth at RAF rate).
   * 3. Render fullscreen quad with parallax shader to canvas.
   */
  protected onRenderFrame(): void {
    const source = this.mediaSource;
    if (
      !this.context ||
      !this.parallaxPipeline ||
      !this.parallaxBindGroup ||
      !this.quadBuffer
    ) return;

    const imageSource = source?.getImageSource();
    if (!imageSource) return;

    // Upload video frame (zero-copy where supported).
    if (this.videoTexture) {
      importImageSource(this.device, this.videoTexture, imageSource, source!.width, source!.height);
    }

    // Fallback: when RVFC is not supported, do depth update here.
    if (!this.rvfcSupported) {
      this.onDepthUpdate(source!.currentTime);
    }

    // Update per-frame parallax offset from mouse/gyro input.
    // x is negated so mouse-right shifts image left (real parallax behavior).
    if (this.readInput) {
      const input = this.readInput();
      this.offsetData[0] = -input.x;
      this.offsetData[1] = input.y;
      this.device.queue.writeBuffer(this.fragmentUniformBuffer!, 0, this.offsetData);
    }

    // Render to canvas.
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.context.getCurrentTexture().createView(),
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.parallaxPipeline);
    pass.setBindGroup(0, this.parallaxBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.draw(4);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Upload raw depth data and run the bilateral filter pass.
   *
   * Runs at RVFC rate (~5fps) when supported, or every RAF frame otherwise.
   */
  protected onDepthUpdate(timeSec: number): void {
    if (
      !this.readDepth ||
      !this.rawDepthTexture ||
      !this.filteredDepthView ||
      !this.bilateralPipeline ||
      !this.bilateralBindGroup ||
      !this.quadBuffer
    ) return;

    const subsampled = this.subsampleDepth(this.readDepth(timeSec));
    const depthData = this.flipDepthY(subsampled);

    // Upload raw depth to texture.
    // Cast required: TypeScript Uint8Array may be backed by SharedArrayBuffer,
    // but writeTexture expects ArrayBuffer-backed views.
    this.device.queue.writeTexture(
      { texture: this.rawDepthTexture },
      depthData as unknown as ArrayBuffer,
      { bytesPerRow: this.depthWidth },
      { width: this.depthWidth, height: this.depthHeight }
    );

    // Run bilateral filter → filtered depth texture.
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: this.filteredDepthView!,
        loadOp: 'clear',
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        storeOp: 'store',
      }],
    });

    pass.setPipeline(this.bilateralPipeline);
    pass.setBindGroup(0, this.bilateralBindGroup);
    pass.setVertexBuffer(0, this.quadBuffer);
    pass.draw(4);
    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Recalculate canvas size and UV transform to match current container.
   */
  protected recalculateViewportLayout(): void {
    if (!this.context) return;

    const { width, height } = this.getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, this.qualityParams.dprCap);

    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
    }

    // Compute cover-fit UV transform.
    this.computeCoverFitUV(this.config.parallaxStrength, this.config.overscanPadding);

    // Update vertex uniform buffer.
    if (this.vertexUniformBuffer) {
      this.device.queue.writeBuffer(
        this.vertexUniformBuffer,
        0,
        new Float32Array([
          this.uvOffset[0], this.uvOffset[1],
          this.uvScale[0], this.uvScale[1],
        ])
      );
    }
  }

  /** Release all GPU resources. */
  protected disposeRenderer(): void {
    this.disposeTextures();

    // Destroy uniform buffers.
    this.bilateralUniformBuffer?.destroy();
    this.bilateralUniformBuffer = null;
    this.vertexUniformBuffer?.destroy();
    this.vertexUniformBuffer = null;
    this.fragmentUniformBuffer?.destroy();
    this.fragmentUniformBuffer = null;

    // Destroy shared resources.
    this.quadBuffer?.destroy();
    this.quadBuffer = null;
    this.linearSampler = null;

    // Clear pipeline references (GC'd by WebGPU).
    this.bilateralPipeline = null;
    this.bilateralBindGroupLayout = null;
    this.bilateralBindGroup = null;
    this.parallaxPipeline = null;
    this.parallaxBindGroupLayout = null;
    this.parallaxBindGroup = null;

    // Unconfigure canvas.
    if (this.context) {
      this.context.unconfigure();
      this.context = null;
    }

    this.depthFlipBuffer = null;
  }

  /**
   * WebGPU device loss recovery.
   *
   * Device loss is handled via the `device.lost` promise (set in constructor).
   * Full recovery requires re-requesting adapter + device, which is managed
   * at the Web Component level by re-creating the renderer.
   */
  protected onContextRestored(): void {
    // No-op for WebGPU — device loss is handled at a higher level.
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Destroy all textures and clear bind groups that reference them. */
  private disposeTextures(): void {
    this.videoTexture?.destroy();
    this.videoTexture = null;
    this.videoTextureView = null;

    this.rawDepthTexture?.destroy();
    this.rawDepthTexture = null;
    this.rawDepthView = null;

    this.filteredDepthTexture?.destroy();
    this.filteredDepthTexture = null;
    this.filteredDepthView = null;

    // Bind groups reference destroyed textures — invalidate them.
    this.bilateralBindGroup = null;
    this.parallaxBindGroup = null;
  }
}
