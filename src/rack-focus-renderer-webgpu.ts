/**
 * Rack Focus Renderer (WebGPU) — GPU-accelerated depth-aware bokeh blur.
 *
 * WebGPU counterpart to `rack-focus-renderer.ts` (WebGL2). Shares the same
 * `RendererBase` abstract base class and `RackFocusRendererConfig` interface.
 *
 * ## Pipeline
 *
 * 1. **Bilateral filter pass** — edge-preserving depth smoothing.
 *    Reads raw depth, writes filtered depth to offscreen r8unorm texture.
 *    Runs at RVFC rate (~5fps, only when depth data changes).
 *
 * 2. **CoC computation pass** — signed Circle of Confusion per pixel.
 *    Reads filtered depth + focus uniforms, writes to r16float offscreen.
 *    Runs at RAF rate.
 *
 * 3. **DOF blur pass** — Poisson disc bokeh blur with depth-aware weighting.
 *    Reads video + CoC, writes blurred color to offscreen rgba8unorm.
 *    Runs at RAF rate.
 *
 * 4. **Composite pass** — blends sharp and blurred by CoC, applies vignette.
 *    Reads video + blurred + CoC, renders to canvas swap chain.
 *    Runs at RAF rate.
 *
 * ## Key differences from WebGL2 version
 *
 * - Pipeline state objects bake all config at creation time
 * - Bind groups replace individual uniform calls
 * - Override constants replace #define injection for POISSON_SAMPLES
 * - `copyExternalImageToTexture` for zero-copy video frame import
 * - `writeTexture` for depth data upload (manual Y-flip)
 * - `r16float` natively supported for CoC texture
 */

import { RendererBase } from './renderer-base';
import type { RackFocusRendererConfig } from './rack-focus-renderer';
import type { MediaSource } from './media-source';
import type { FocusState } from './focus-input-handler';
import { resolveQualityWebGPU } from './quality';
import {
  createFullscreenQuadBuffer,
  createUniformBuffer,
  createLinearSampler,
  importImageSource,
} from './webgpu-utils';
import { FULLSCREEN_QUAD_LAYOUT } from './render-pass-webgpu';

// ---------------------------------------------------------------------------
// WGSL Shaders
// ---------------------------------------------------------------------------

import COC_WGSL from './shaders/rack-focus/coc.wgsl?raw';
import DOF_BLUR_WGSL from './shaders/rack-focus/dof-blur.wgsl?raw';
import COMPOSITE_WGSL from './shaders/rack-focus/composite.wgsl?raw';
import BILATERAL_VERTEX_WGSL from './shaders/parallax/bilateral-vertex.wgsl?raw';
import BILATERAL_FRAGMENT_WGSL from './shaders/parallax/bilateral-fragment.wgsl?raw';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_DEFAULTS = {
  aperture: 1.0,
  maxBlurRadius: 24.0,
  focusRange: 0.05,
  depthScale: 50.0,
  highlightThreshold: 0.85,
  highlightBoost: 2.0,
  vignetteStrength: 0.15,
} as const;

/** Spatial sigma² values indexed by bilateral radius. */
const SPATIAL_SIGMA2_BY_RADIUS: Record<number, number> = {
  2: 2.25,
  1: 0.5625,
};

// ---------------------------------------------------------------------------
// Uniform buffer sizes (matching WGSL struct layouts with alignment)
// ---------------------------------------------------------------------------

/** Bilateral: texelSize(vec2f=8) + spatialSigma2(f32=4) + pad = 16. */
const BILATERAL_UB_SIZE = 16;

/**
 * CoC (combined vertex+fragment):
 *   uvOffset(vec2f=8) + uvScale(vec2f=8) +
 *   focalDepth(f32=4) + aperture(f32=4) + focusRange(f32=4) + depthScale(f32=4) +
 *   maxBlurRadius(f32=4) + breathScale(f32=4) + breathOffset(vec2f=8) = 48.
 */
const COC_UB_SIZE = 48;

/**
 * DOF blur:
 *   uvOffset(vec2f=8) + uvScale(vec2f=8) +
 *   imageTexelSize(vec2f=8) + maxBlurRadius(f32=4) +
 *   highlightThreshold(f32=4) + highlightBoost(f32=4) + pad(4) = 48.
 */
const DOF_BLUR_UB_SIZE = 48;

/**
 * Composite:
 *   uvOffset(vec2f=8) + uvScale(vec2f=8) + vignetteStrength(f32=4) + pad(12) = 32.
 */
const COMPOSITE_UB_SIZE = 32;

// ---------------------------------------------------------------------------
// Resolved config
// ---------------------------------------------------------------------------

interface ResolvedConfig {
  aperture: number;
  maxBlurRadius: number;
  focusRange: number;
  depthScale: number;
  highlightThreshold: number;
  highlightBoost: number;
  vignetteStrength: number;
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class RackFocusRendererWebGPU extends RendererBase {
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat;

  private readonly config: ResolvedConfig;
  private readonly dofDivisor: number;

  // Shared resources
  private quadBuffer: GPUBuffer | null = null;
  private linearSampler: GPUSampler | null = null;

  // Bilateral filter pass
  private bilateralPipeline: GPURenderPipeline | null = null;
  private bilateralBindGroupLayout: GPUBindGroupLayout | null = null;
  private bilateralUniformBuffer: GPUBuffer | null = null;
  private bilateralBindGroup: GPUBindGroup | null = null;
  private rawDepthTexture: GPUTexture | null = null;
  private rawDepthView: GPUTextureView | null = null;

  // Filtered depth (bilateral output → CoC input)
  private filteredDepthTexture: GPUTexture | null = null;
  private filteredDepthView: GPUTextureView | null = null;

  // CoC pass
  private cocPipeline: GPURenderPipeline | null = null;
  private cocBindGroupLayout: GPUBindGroupLayout | null = null;
  private cocUniformBuffer: GPUBuffer | null = null;
  private cocBindGroup: GPUBindGroup | null = null;
  private cocTexture: GPUTexture | null = null;
  private cocView: GPUTextureView | null = null;

  // DOF blur pass
  private dofBlurPipeline: GPURenderPipeline | null = null;
  private dofBlurBindGroupLayout: GPUBindGroupLayout | null = null;
  private dofBlurUniformBuffer: GPUBuffer | null = null;
  private dofBlurBindGroup: GPUBindGroup | null = null;
  private blurredTexture: GPUTexture | null = null;
  private blurredView: GPUTextureView | null = null;

  // Composite pass
  private compositePipeline: GPURenderPipeline | null = null;
  private compositeBindGroupLayout: GPUBindGroupLayout | null = null;
  private compositeUniformBuffer: GPUBuffer | null = null;
  private compositeBindGroup: GPUBindGroup | null = null;

  // Video texture
  private videoTexture: GPUTexture | null = null;
  private videoTextureView: GPUTextureView | null = null;

  // Focus state callback
  private readFocusState: (() => FocusState) | null = null;

  // DOF buffer dimensions
  private dofWidth = 0;
  private dofHeight = 0;

  // Pre-allocated per-frame scratch buffers (avoids GC pressure from per-frame Float32Array allocations)
  private readonly cocFocalDepthBuf = new Float32Array(1);
  private readonly cocBreathBuf = new Float32Array(3);


  constructor(
    parent: HTMLElement,
    config: RackFocusRendererConfig,
    device: GPUDevice,
    adapterInfo: GPUAdapterInfo
  ) {
    super(parent);
    this.device = device;

    this.config = {
      aperture: config.aperture ?? CONFIG_DEFAULTS.aperture,
      maxBlurRadius: config.maxBlurRadius ?? CONFIG_DEFAULTS.maxBlurRadius,
      focusRange: config.focusRange ?? CONFIG_DEFAULTS.focusRange,
      depthScale: config.depthScale ?? CONFIG_DEFAULTS.depthScale,
      highlightThreshold: config.highlightThreshold ?? CONFIG_DEFAULTS.highlightThreshold,
      highlightBoost: config.highlightBloom ? (config.highlightBoost ?? CONFIG_DEFAULTS.highlightBoost) : 1.0,
      vignetteStrength: config.vignetteStrength ?? CONFIG_DEFAULTS.vignetteStrength,
    };

    this.qualityParams = resolveQualityWebGPU(adapterInfo, config.quality);
    this.dofDivisor = this.qualityParams.tier === 'low' ? 2 : 1;

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

    // Create pipelines.
    this.createBilateralPipeline();
    this.createCocPipeline();
    this.createDofBlurPipeline();
    this.createCompositePipeline();

    // Allocate uniform buffers.
    this.bilateralUniformBuffer = createUniformBuffer(device, BILATERAL_UB_SIZE);
    this.cocUniformBuffer = createUniformBuffer(device, COC_UB_SIZE);
    this.dofBlurUniformBuffer = createUniformBuffer(device, DOF_BLUR_UB_SIZE);
    this.compositeUniformBuffer = createUniformBuffer(device, COMPOSITE_UB_SIZE);

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

  initialize(source: MediaSource, depthWidth: number, depthHeight: number): void {
    this.disposeTextures();

    this.isCameraSource = source.type === 'camera';
    this.videoAspect = source.width / source.height;
    this.clampDepthDimensions(depthWidth, depthHeight, this.qualityParams.depthMaxDim);

    // Video texture.
    this.videoTexture = this.device.createTexture({
      size: [source.width, source.height],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.videoTextureView = this.videoTexture.createView();

    // Raw depth texture.
    this.rawDepthTexture = this.device.createTexture({
      size: [this.depthWidth, this.depthHeight],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.rawDepthView = this.rawDepthTexture.createView();

    // Filtered depth texture.
    this.filteredDepthTexture = this.device.createTexture({
      size: [this.depthWidth, this.depthHeight],
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.filteredDepthView = this.filteredDepthTexture.createView();

    // Write bilateral static uniforms.
    const spatialSigma2 = SPATIAL_SIGMA2_BY_RADIUS[this.qualityParams.bilateralRadius] ?? 2.25;
    this.device.queue.writeBuffer(
      this.bilateralUniformBuffer!,
      0,
      new Float32Array([
        1.0 / this.depthWidth,
        1.0 / this.depthHeight,
        spatialSigma2,
        0, // padding
      ])
    );

    // Write static DOF blur uniforms (threshold + boost; texel size updated on resize).
    this.writeStaticDofBlurUniforms();

    // Write static composite uniforms (vignette; UV updated on resize).
    this.writeStaticCompositeUniforms();

    // Write static CoC uniforms (aperture, range, scale, maxBlur; focus state updated per-frame).
    this.writeStaticCocUniforms();

    // Rebuild bilateral bind group.
    this.rebuildBilateralBindGroup();

    // DOF FBOs are created in recalculateViewportLayout.
    this.recalculateViewportLayout();
  }

  /**
   * Set the focus state callback before calling start().
   * Rack focus reads focus state via this callback instead of the parallax readInput.
   */
  setFocusStateCallback(readFocusState: () => FocusState): void {
    this.readFocusState = readFocusState;
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

    this.bilateralPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.bilateralBindGroupLayout] }),
      vertex: {
        module: device.createShaderModule({ code: BILATERAL_VERTEX_WGSL }),
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: device.createShaderModule({ code: BILATERAL_FRAGMENT_WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: 'r8unorm' }],
        constants: { BILATERAL_RADIUS: this.qualityParams.bilateralRadius },
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createCocPipeline(): void {
    const device = this.device;

    this.cocBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    this.cocPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.cocBindGroupLayout] }),
      vertex: {
        module: device.createShaderModule({ code: COC_WGSL }),
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: device.createShaderModule({ code: COC_WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: 'r16float' }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createDofBlurPipeline(): void {
    const device = this.device;

    const poissonSamples = this.qualityParams.poissonSamples;

    this.dofBlurBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      ],
    });

    // CoC texture is r16float which requires unfilterable-float + non-filtering sampler
    // unless float32-filterable feature is enabled. Use non-filtering sampler for CoC.
    const cocSampler = device.createSampler({
      magFilter: 'nearest',
      minFilter: 'nearest',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    // Store for bind group creation.
    (this as Record<string, unknown>)._cocSampler = cocSampler;

    this.dofBlurPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.dofBlurBindGroupLayout] }),
      vertex: {
        module: device.createShaderModule({ code: DOF_BLUR_WGSL }),
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: device.createShaderModule({ code: DOF_BLUR_WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba8unorm' }],
        constants: { POISSON_SAMPLES: poissonSamples },
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createCompositePipeline(): void {
    const device = this.device;

    this.compositeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'non-filtering' } },
      ],
    });

    this.compositePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.compositeBindGroupLayout] }),
      vertex: {
        module: device.createShaderModule({ code: COMPOSITE_WGSL }),
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: device.createShaderModule({ code: COMPOSITE_WGSL }),
        entryPoint: 'fs_main',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  // -----------------------------------------------------------------------
  // Bind groups
  // -----------------------------------------------------------------------

  private rebuildBilateralBindGroup(): void {
    if (!this.bilateralBindGroupLayout || !this.bilateralUniformBuffer ||
        !this.rawDepthView || !this.linearSampler) return;

    this.bilateralBindGroup = this.device.createBindGroup({
      layout: this.bilateralBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.bilateralUniformBuffer } },
        { binding: 1, resource: this.rawDepthView },
        { binding: 2, resource: this.linearSampler },
      ],
    });
  }

  private rebuildCocBindGroup(): void {
    if (!this.cocBindGroupLayout || !this.cocUniformBuffer ||
        !this.filteredDepthView || !this.linearSampler) return;

    this.cocBindGroup = this.device.createBindGroup({
      layout: this.cocBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.cocUniformBuffer } },
        { binding: 1, resource: this.filteredDepthView },
        { binding: 2, resource: this.linearSampler },
      ],
    });
  }

  private rebuildDofBlurBindGroup(): void {
    if (!this.dofBlurBindGroupLayout || !this.dofBlurUniformBuffer ||
        !this.videoTextureView || !this.linearSampler || !this.cocView) return;

    const cocSampler = (this as Record<string, unknown>)._cocSampler as GPUSampler;

    this.dofBlurBindGroup = this.device.createBindGroup({
      layout: this.dofBlurBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.dofBlurUniformBuffer } },
        { binding: 1, resource: this.videoTextureView },
        { binding: 2, resource: this.linearSampler },
        { binding: 3, resource: this.cocView },
        { binding: 4, resource: cocSampler },
      ],
    });
  }

  private rebuildCompositeBindGroup(): void {
    if (!this.compositeBindGroupLayout || !this.compositeUniformBuffer ||
        !this.videoTextureView || !this.linearSampler ||
        !this.blurredView || !this.cocView) return;

    const cocSampler = (this as Record<string, unknown>)._cocSampler as GPUSampler;

    this.compositeBindGroup = this.device.createBindGroup({
      layout: this.compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
        { binding: 1, resource: this.videoTextureView },
        { binding: 2, resource: this.linearSampler },
        { binding: 3, resource: this.blurredView },
        { binding: 4, resource: this.linearSampler },
        { binding: 5, resource: this.cocView },
        { binding: 6, resource: cocSampler },
      ],
    });
  }

  // -----------------------------------------------------------------------
  // Uniform helpers
  // -----------------------------------------------------------------------

  private writeStaticCocUniforms(): void {
    // Write static fields (aperture, focusRange, depthScale, maxBlurRadius).
    // Per-frame fields (focalDepth, breathScale, breathOffset) are updated in onRenderFrame.
    const buf = new Float32Array(COC_UB_SIZE / 4);
    // uvOffset[0], uvOffset[1] → updated on resize
    // uvScale[0], uvScale[1] → updated on resize
    buf[4] = 0.5; // focalDepth (initial)
    buf[5] = this.config.aperture;
    buf[6] = this.config.focusRange;
    buf[7] = this.config.depthScale;
    buf[8] = this.config.maxBlurRadius;
    buf[9] = 1.0; // breathScale (idle)
    buf[10] = 0.0; // breathOffset.x
    buf[11] = 0.0; // breathOffset.y
    this.device.queue.writeBuffer(this.cocUniformBuffer!, 0, buf);
  }

  private writeStaticDofBlurUniforms(): void {
    const buf = new Float32Array(DOF_BLUR_UB_SIZE / 4);
    // [0-1] uvOffset → updated on resize
    // [2-3] uvScale → updated on resize
    // [4-5] imageTexelSize → updated on resize
    buf[6] = this.config.maxBlurRadius;
    buf[7] = this.config.highlightThreshold;
    buf[8] = this.config.highlightBoost;
    this.device.queue.writeBuffer(this.dofBlurUniformBuffer!, 0, buf);
  }

  private writeStaticCompositeUniforms(): void {
    const buf = new Float32Array(COMPOSITE_UB_SIZE / 4);
    // uvOffset, uvScale → updated on resize
    buf[4] = this.config.vignetteStrength;
    this.device.queue.writeBuffer(this.compositeUniformBuffer!, 0, buf);
  }

  // -----------------------------------------------------------------------
  // Abstract method implementations
  // -----------------------------------------------------------------------

  protected onRenderFrame(): void {
    const source = this.mediaSource;
    if (!this.context || !this.cocPipeline || !this.dofBlurPipeline ||
        !this.compositePipeline || !this.quadBuffer) return;

    // Upload video frame if available. If the source is temporarily unavailable
    // (e.g., during loop seek), skip upload but still render with the last frame
    // to avoid blank/transparent flashes at loop boundaries.
    const imageSource = source?.getImageSource();
    if (imageSource && this.videoTexture) {
      // Rack focus renders through FBOs (CoC → blur → composite), so use flipY=false
      // to avoid double-flip. Same pattern as portal renderer.
      importImageSource(this.device, this.videoTexture, imageSource, source!.width, source!.height, false);
    } else if (!this.videoTexture) {
      return; // No video texture allocated yet — nothing to render.
    }

    // Fallback depth update when RVFC not supported.
    if (!this.rvfcSupported) {
      this.onDepthUpdate(source!.currentTime);
    }

    // Read focus state and update CoC per-frame uniforms.
    // Per-frame fields are NOT contiguous in the struct — write them separately.
    //   byte 16: focalDepth (f32)
    //   bytes 20-32: static fields (aperture, focusRange, depthScale, maxBlurRadius)
    //   byte 36: breathScale (f32)
    //   byte 40: breathOffset (vec2f)
    if (this.readFocusState && this.cocUniformBuffer) {
      const state = this.readFocusState();
      // focalDepth at byte 16 — reuse pre-allocated buffer.
      this.cocFocalDepthBuf[0] = state.focalDepth;
      this.device.queue.writeBuffer(this.cocUniformBuffer, 16, this.cocFocalDepthBuf);
      // breathScale + breathOffset at byte 36 — reuse pre-allocated buffer.
      this.cocBreathBuf[0] = state.breathScale;
      this.cocBreathBuf[1] = state.breathOffset[0];
      this.cocBreathBuf[2] = state.breathOffset[1];
      this.device.queue.writeBuffer(this.cocUniformBuffer, 36, this.cocBreathBuf);
    }

    const encoder = this.device.createCommandEncoder();

    // --- Pass 2: CoC → cocTexture ---
    if (this.cocView && this.cocBindGroup) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.cocView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.cocPipeline);
      pass.setBindGroup(0, this.cocBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    // --- Pass 3: DOF blur → blurredTexture ---
    if (this.blurredView && this.dofBlurBindGroup) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.blurredView,
          loadOp: 'clear',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.dofBlurPipeline);
      pass.setBindGroup(0, this.dofBlurBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    // --- Pass 4: Composite → canvas ---
    if (this.compositeBindGroup) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.compositePipeline);
      pass.setBindGroup(0, this.compositeBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  protected onDepthUpdate(timeSec: number): void {
    if (!this.readDepth || !this.rawDepthTexture || !this.filteredDepthView ||
        !this.bilateralPipeline || !this.bilateralBindGroup || !this.quadBuffer) return;

    const subsampled = this.subsampleDepth(this.readDepth(timeSec));

    // No flipDepthY — depth data stays in natural (top-to-bottom) orientation to
    // match the video texture (imported with flipY=false for FBO-based rendering).
    this.device.queue.writeTexture(
      { texture: this.rawDepthTexture },
      subsampled as unknown as ArrayBuffer,
      { bytesPerRow: this.depthWidth },
      { width: this.depthWidth, height: this.depthHeight }
    );

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

    // DOF buffer resolution.
    this.dofWidth = Math.max(1, Math.floor(bufferWidth / this.dofDivisor));
    this.dofHeight = Math.max(1, Math.floor(bufferHeight / this.dofDivisor));

    // Recreate DOF offscreen textures.
    this.recreateDofTextures();

    // Compute cover-fit UV transform.
    this.computeCoverFitUV(0, 0);

    // Update UV transform in CoC uniform buffer.
    if (this.cocUniformBuffer) {
      this.device.queue.writeBuffer(
        this.cocUniformBuffer,
        0,
        new Float32Array([
          this.uvOffset[0], this.uvOffset[1],
          this.uvScale[0], this.uvScale[1],
        ])
      );
    }

    // Update UV transform in composite uniform buffer.
    if (this.compositeUniformBuffer) {
      this.device.queue.writeBuffer(
        this.compositeUniformBuffer,
        0,
        new Float32Array([
          this.uvOffset[0], this.uvOffset[1],
          this.uvScale[0], this.uvScale[1],
        ])
      );
    }

    // Update DOF blur UV transform + texel size.
    if (this.dofBlurUniformBuffer) {
      this.device.queue.writeBuffer(
        this.dofBlurUniformBuffer,
        0,
        new Float32Array([
          this.uvOffset[0], this.uvOffset[1],
          this.uvScale[0], this.uvScale[1],
          1.0 / this.dofWidth, 1.0 / this.dofHeight,
        ])
      );
    }

    // Rebuild bind groups that reference DOF textures.
    this.rebuildCocBindGroup();
    this.rebuildDofBlurBindGroup();
    this.rebuildCompositeBindGroup();
  }

  protected disposeRenderer(): void {
    this.disposeTextures();
    this.disposeDofTextures();

    this.bilateralUniformBuffer?.destroy(); this.bilateralUniformBuffer = null;
    this.cocUniformBuffer?.destroy(); this.cocUniformBuffer = null;
    this.dofBlurUniformBuffer?.destroy(); this.dofBlurUniformBuffer = null;
    this.compositeUniformBuffer?.destroy(); this.compositeUniformBuffer = null;

    this.quadBuffer?.destroy(); this.quadBuffer = null;
    this.linearSampler = null;

    this.bilateralPipeline = null;
    this.bilateralBindGroupLayout = null;
    this.bilateralBindGroup = null;
    this.cocPipeline = null;
    this.cocBindGroupLayout = null;
    this.cocBindGroup = null;
    this.dofBlurPipeline = null;
    this.dofBlurBindGroupLayout = null;
    this.dofBlurBindGroup = null;
    this.compositePipeline = null;
    this.compositeBindGroupLayout = null;
    this.compositeBindGroup = null;

    if (this.context) {
      this.context.unconfigure();
      this.context = null;
    }

    this.readFocusState = null;
  }

  protected onContextRestored(): void {
    // No-op — WebGPU device loss handled at Web Component level.
  }

  // -----------------------------------------------------------------------
  // DOF texture management
  // -----------------------------------------------------------------------

  private recreateDofTextures(): void {
    this.disposeDofTextures();

    // CoC texture (r16float).
    this.cocTexture = this.device.createTexture({
      size: [this.dofWidth, this.dofHeight],
      format: 'r16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.cocView = this.cocTexture.createView();

    // Blurred color texture (rgba8unorm).
    this.blurredTexture = this.device.createTexture({
      size: [this.dofWidth, this.dofHeight],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.blurredView = this.blurredTexture.createView();
  }

  private disposeDofTextures(): void {
    this.cocTexture?.destroy(); this.cocTexture = null; this.cocView = null;
    this.blurredTexture?.destroy(); this.blurredTexture = null; this.blurredView = null;
    this.dofBlurBindGroup = null;
    this.compositeBindGroup = null;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  private disposeTextures(): void {
    this.videoTexture?.destroy(); this.videoTexture = null; this.videoTextureView = null;
    this.rawDepthTexture?.destroy(); this.rawDepthTexture = null; this.rawDepthView = null;
    this.filteredDepthTexture?.destroy(); this.filteredDepthTexture = null; this.filteredDepthView = null;
    this.bilateralBindGroup = null;
    this.cocBindGroup = null;
    this.dofBlurBindGroup = null;
    this.compositeBindGroup = null;
  }
}
