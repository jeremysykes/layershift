/**
 * Portal Renderer (WebGPU) — GPU-accelerated multi-pass portal compositing.
 *
 * WebGPU counterpart to `portal-renderer.ts` (WebGL2). Shares the same
 * `RendererBase` abstract base class and `PortalRendererConfig` interface.
 *
 * ## Pipeline (per frame, 6 draw calls)
 *
 * 1. **Interior pass** — POM ray-march + lens depth + DOF + fog + color grade.
 *    MRT output: color (rgba8unorm) + depth (r8unorm) to offscreen textures.
 *
 * 2a. **Stencil mark** — triangulated SVG mesh into depth-stencil attachment.
 *     Color writes disabled, stencil ref=1 written.
 *
 * 2b. **Composite** — emissive interior passthrough with edge occlusion ramp,
 *     stencil-tested (only where stencil == 1).
 *
 * 2c. **Chamfer geometry** — Blinn-Phong lit ring with frosted-glass blur.
 *
 * 3. **Boundary effects** — rim lighting, refraction, chromatic fringe,
 *    volumetric edge wall. Alpha blended onto backbuffer.
 *
 * ## JFA Distance Field (cached, recomputed on resize)
 *
 * mask render -> seed extraction -> flood iterations -> distance conversion.
 * Uses rg16float ping-pong textures. Runs at reduced resolution (quality tier).
 *
 * ## Key WebGPU differences from WebGL2 version
 *
 * - Stencil via explicit `depth24plus-stencil8` texture attachment.
 * - MRT via multiple color attachments in a single render pass.
 * - Float render targets (rg16float) natively supported — no extension needed.
 * - Pipeline state objects bake blend/stencil/depth config at creation time.
 * - Bind groups replace individual uniform calls.
 * - Override constants for POM loop bound.
 * - `writeTexture` with manual Y-flip (no UNPACK_FLIP_Y_WEBGL equivalent).
 * - `copyExternalImageToTexture` for zero-copy video frame import.
 */

import { RendererBase } from './renderer-base';
import type { PortalRendererConfig } from './portal-renderer';
import { buildEdgeMesh, buildChamferMesh } from './portal-renderer';
import { resolveQualityWebGPU } from './quality';
import { JFADistanceField } from './jfa-distance-field';
import type { ShapeMesh } from './shape-generator';
import {
  createFullscreenQuadBuffer,
  createUniformBuffer,
  createLinearSampler,
  createNearestSampler,
  createVertexBuffer,
  createIndexBuffer,
  importVideoFrame,
} from './webgpu-utils';
import {
  FULLSCREEN_QUAD_LAYOUT,
  MESH_POSITION_LAYOUT,
  BOUNDARY_VERTEX_LAYOUT,
  CHAMFER_VERTEX_LAYOUT,
} from './render-pass-webgpu';

// ---------------------------------------------------------------------------
// WGSL Shaders (imported from external files via Vite ?raw)
// ---------------------------------------------------------------------------

import STENCIL_WGSL from './shaders/portal/stencil.wgsl?raw';
import MASK_WGSL from './shaders/portal/mask.wgsl?raw';
import JFA_SEED_WGSL from './shaders/portal/jfa-seed.wgsl?raw';
import JFA_FLOOD_WGSL from './shaders/portal/jfa-flood.wgsl?raw';
import JFA_DIST_WGSL from './shaders/portal/jfa-dist.wgsl?raw';
import INTERIOR_WGSL from './shaders/portal/interior.wgsl?raw';
import COMPOSITE_WGSL from './shaders/portal/composite.wgsl?raw';
import BOUNDARY_WGSL from './shaders/portal/boundary.wgsl?raw';
import CHAMFER_WGSL from './shaders/portal/chamfer.wgsl?raw';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Compile-time upper bound for the POM for-loop in the interior shader. */
const MAX_POM_STEPS = 64;

// ---------------------------------------------------------------------------
// Uniform buffer byte sizes (matching WGSL struct layouts with std140 alignment)
// ---------------------------------------------------------------------------

/** Stencil/Mask: meshScale(vec2f=8) -> pad to 16. */
const MESH_SCALE_UNIFORM_SIZE = 16;

/**
 * Interior vertex uniforms:
 *   uvOffset(vec2f=8) + uvScale(vec2f=8) = 16.
 */
const INTERIOR_VERTEX_UNIFORM_SIZE = 16;

/**
 * Interior fragment uniforms (FragmentUniforms in interior.wgsl):
 *
 * WGSL struct layout (std140-like alignment):
 *   offset:            vec2f    @ 0   (8 bytes)
 *   strength:          f32      @ 8   (4 bytes)
 *   pomSteps:          i32      @ 12  (4 bytes)
 *   depthPower:        f32      @ 16  (4 bytes)
 *   depthScale:        f32      @ 20  (4 bytes)
 *   depthBias:         f32      @ 24  (4 bytes)
 *   contrastLow:       f32      @ 28  (4 bytes)
 *   contrastHigh:      f32      @ 32  (4 bytes)
 *   verticalReduction: f32      @ 36  (4 bytes)
 *   dofStart:          f32      @ 40  (4 bytes)
 *   dofStrength:       f32      @ 44  (4 bytes)
 *   imageTexelSize:    vec2f    @ 48  (8 bytes)
 *   fogDensity:        f32      @ 56  (4 bytes)
 *   _pad:                       @ 60  (4 bytes, align fogColor to 16)
 *   fogColor:          vec3f    @ 64  (12 bytes, aligned to 16)
 *   colorShift:        f32      @ 76  (4 bytes)
 *   brightnessBias:    f32      @ 80  (4 bytes)
 *   _pad:                       @ 84  (12 bytes, round up to 16)
 *   Total: 96 bytes
 */
const INTERIOR_FRAGMENT_UNIFORM_SIZE = 96;

/**
 * Composite uniforms:
 *   edgeOcclusionWidth(f32=4) + edgeOcclusionStrength(f32=4) = 8 -> pad to 16.
 */
const COMPOSITE_UNIFORM_SIZE = 16;

/**
 * Boundary uniforms (Uniforms in boundary.wgsl):
 *
 *   rimWidth:           f32      @ 0   (4 bytes)
 *   _pad:                        @ 4   (4 bytes, align meshScale to 8)
 *   meshScale:          vec2f    @ 8   (8 bytes)
 *   rimIntensity:       f32      @ 16  (4 bytes)
 *   _pad:                        @ 20  (12 bytes, align rimColor to 16)
 *   rimColor:           vec3f    @ 32  (12 bytes)
 *   refractionStrength: f32      @ 44  (4 bytes)
 *   chromaticStrength:  f32      @ 48  (4 bytes)
 *   occlusionIntensity: f32      @ 52  (4 bytes)
 *   texelSize:          vec2f    @ 56  (8 bytes)
 *   edgeThickness:      f32      @ 64  (4 bytes)
 *   edgeSpecular:       f32      @ 68  (4 bytes)
 *   _pad:                        @ 72  (8 bytes, align edgeColor to 16)
 *   edgeColor:          vec3f    @ 80  (12 bytes)
 *   _pad:                        @ 92  (4 bytes, align lightDir to 8)
 *   lightDir:           vec2f    @ 96  (8 bytes)
 *   bevelIntensity:     f32      @ 104 (4 bytes)
 *   _pad:                        @ 108 (4 bytes, round up to 16)
 *   Total: 112 bytes
 */
const BOUNDARY_UNIFORM_SIZE = 112;

/**
 * Chamfer uniforms (Uniforms in chamfer.wgsl):
 *
 *   lightDir3:         vec3f    @ 0   (12 bytes)
 *   _pad:                       @ 12  (4 bytes, align chamferColor to 16)
 *   chamferColor:      vec3f    @ 16  (12 bytes)
 *   chamferAmbient:    f32      @ 28  (4 bytes)
 *   chamferSpecular:   f32      @ 32  (4 bytes)
 *   chamferShininess:  f32      @ 36  (4 bytes)
 *   meshScale:         vec2f    @ 40  (8 bytes)
 *   texelSize:         vec2f    @ 48  (8 bytes)
 *   _pad:                       @ 56  (8 bytes, round up to 16)
 *   Total: 64 bytes
 */
const CHAMFER_UNIFORM_SIZE = 64;

/**
 * JFA seed uniforms: texelSize(vec2f=8) -> pad to 16.
 */
const JFA_SEED_UNIFORM_SIZE = 16;

/**
 * JFA flood uniforms: texelSize(vec2f=8) + stepSize(f32=4) -> 12 -> pad to 16.
 */
const JFA_FLOOD_UNIFORM_SIZE = 16;

/**
 * JFA dist uniforms: texelSize(vec2f=8) + bevelWidth(f32=4) -> 12 -> pad to 16.
 */
const JFA_DIST_UNIFORM_SIZE = 16;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

export class PortalRendererWebGPU extends RendererBase {
  // ---- WebGPU core ----
  private device: GPUDevice;
  private context: GPUCanvasContext | null = null;
  private canvasFormat: GPUTextureFormat;

  // ---- Config ----
  private readonly config: PortalRendererConfig;

  // ---- Shared resources ----
  private quadBuffer: GPUBuffer | null = null;
  private linearSampler: GPUSampler | null = null;
  private nearestSampler: GPUSampler | null = null;

  // ---- Pipelines ----
  private interiorPipeline: GPURenderPipeline | null = null;
  private interiorBindGroupLayout: GPUBindGroupLayout | null = null;
  private stencilMarkPipeline: GPURenderPipeline | null = null;
  private stencilMarkBindGroupLayout: GPUBindGroupLayout | null = null;
  private compositePipeline: GPURenderPipeline | null = null;
  private compositeBindGroupLayout: GPUBindGroupLayout | null = null;
  private chamferPipeline: GPURenderPipeline | null = null;
  private chamferBindGroupLayout: GPUBindGroupLayout | null = null;
  private boundaryPipeline: GPURenderPipeline | null = null;
  private boundaryBindGroupLayout: GPUBindGroupLayout | null = null;

  // JFA pipelines
  private maskPipeline: GPURenderPipeline | null = null;
  private maskBindGroupLayout: GPUBindGroupLayout | null = null;
  private jfaSeedPipeline: GPURenderPipeline | null = null;
  private jfaSeedBindGroupLayout: GPUBindGroupLayout | null = null;
  private jfaFloodPipeline: GPURenderPipeline | null = null;
  private jfaFloodBindGroupLayout: GPUBindGroupLayout | null = null;
  private jfaDistPipeline: GPURenderPipeline | null = null;
  private jfaDistBindGroupLayout: GPUBindGroupLayout | null = null;

  // ---- Uniform buffers ----
  private meshScaleUniformBuffer: GPUBuffer | null = null;
  private interiorVertexUniformBuffer: GPUBuffer | null = null;
  private interiorFragmentUniformBuffer: GPUBuffer | null = null;
  private compositeUniformBuffer: GPUBuffer | null = null;
  private boundaryUniformBuffer: GPUBuffer | null = null;
  private chamferUniformBuffer: GPUBuffer | null = null;
  private jfaSeedUniformBuffer: GPUBuffer | null = null;
  private jfaFloodUniformBuffer: GPUBuffer | null = null;
  private jfaDistUniformBuffer: GPUBuffer | null = null;

  // ---- Bind groups (rebuilt when textures change) ----
  private interiorBindGroup: GPUBindGroup | null = null;
  private stencilMarkBindGroup: GPUBindGroup | null = null;
  private compositeBindGroup: GPUBindGroup | null = null;
  private chamferBindGroup: GPUBindGroup | null = null;
  private boundaryBindGroup: GPUBindGroup | null = null;
  private maskBindGroup: GPUBindGroup | null = null;
  private jfaSeedBindGroup: GPUBindGroup | null = null;
  private jfaDistBindGroup: GPUBindGroup | null = null;
  // JFA flood bind groups are rebuilt per-iteration (ping-pong swap)

  // ---- Source textures ----
  private videoTexture: GPUTexture | null = null;
  private videoTextureView: GPUTextureView | null = null;
  private depthTexture: GPUTexture | null = null;
  private depthTextureView: GPUTextureView | null = null;

  // ---- Interior FBO textures (MRT output) ----
  private interiorColorTexture: GPUTexture | null = null;
  private interiorColorView: GPUTextureView | null = null;
  private interiorDepthTexture: GPUTexture | null = null;
  private interiorDepthView: GPUTextureView | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  // ---- Depth-stencil attachment ----
  private depthStencilTexture: GPUTexture | null = null;
  private depthStencilView: GPUTextureView | null = null;
  private dsWidth = 0;
  private dsHeight = 0;

  // ---- JFA distance field resources ----
  private jfaMaskTexture: GPUTexture | null = null;
  private jfaMaskView: GPUTextureView | null = null;
  private jfaPingTexture: GPUTexture | null = null;
  private jfaPingView: GPUTextureView | null = null;
  private jfaPongTexture: GPUTexture | null = null;
  private jfaPongView: GPUTextureView | null = null;
  private jfaDistTexture: GPUTexture | null = null;
  private jfaDistView: GPUTextureView | null = null;
  private jfaWidth = 0;
  private jfaHeight = 0;
  private jfaDirty = true;

  // ---- Geometry buffers ----
  private stencilVertexBuffer: GPUBuffer | null = null;
  private stencilIndexBuffer: GPUBuffer | null = null;
  private stencilIndexCount = 0;
  private boundaryVertexBuffer: GPUBuffer | null = null;
  private boundaryVertexCount = 0;
  private chamferVertexBuffer: GPUBuffer | null = null;
  private chamferVertexCount = 0;

  // ---- Mesh scale (portal-specific) ----
  private meshAspect = 1;
  private meshScaleX = 0.65;
  private meshScaleY = 0.65;

  // ---- Precomputed light directions ----
  private lightDirX = -0.707;
  private lightDirY = 0.707;
  private lightDir3: [number, number, number] = [-0.5, 0.7, -0.3];

  // ---- Depth Y-flip buffer ----
  private depthFlipBuffer: Uint8Array | null = null;

  // ---- Per-frame scratch ----
  private readonly offsetData = new Float32Array(2);

  constructor(
    parent: HTMLElement,
    config: PortalRendererConfig,
    device: GPUDevice,
    adapterInfo: GPUAdapterInfo
  ) {
    super(parent);
    this.device = device;
    this.config = { ...config };

    // Quality tier from device capabilities.
    this.qualityParams = resolveQualityWebGPU(adapterInfo, config.quality);

    // Precompute 2D light direction from angle (for bevel).
    const angleRad = (this.config.bevelLightAngle * Math.PI) / 180;
    this.lightDirX = Math.cos(angleRad);
    this.lightDirY = Math.sin(angleRad);

    // Normalize 3D light direction for chamfer lighting.
    const ld = this.config.lightDirection;
    const ldLen = Math.sqrt(ld[0] * ld[0] + ld[1] * ld[1] + ld[2] * ld[2]);
    if (ldLen > 1e-6) {
      this.lightDir3 = [ld[0] / ldLen, ld[1] / ldLen, ld[2] / ldLen];
    }

    // Configure canvas context.
    this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
    this.canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    this.context.configure({
      device,
      format: this.canvasFormat,
      alphaMode: 'premultiplied',
    });

    // Shared resources.
    this.quadBuffer = createFullscreenQuadBuffer(device);
    this.linearSampler = createLinearSampler(device);
    this.nearestSampler = createNearestSampler(device);

    // Create all pipelines (bake state at init time).
    this.createInteriorPipeline();
    this.createStencilMarkPipeline();
    this.createCompositePipeline();
    this.createChamferPipeline();
    this.createBoundaryPipeline();
    this.createMaskPipeline();
    this.createJFASeedPipeline();
    this.createJFAFloodPipeline();
    this.createJFADistPipeline();

    // Allocate uniform buffers.
    this.meshScaleUniformBuffer = createUniformBuffer(device, MESH_SCALE_UNIFORM_SIZE);
    this.interiorVertexUniformBuffer = createUniformBuffer(device, INTERIOR_VERTEX_UNIFORM_SIZE);
    this.interiorFragmentUniformBuffer = createUniformBuffer(device, INTERIOR_FRAGMENT_UNIFORM_SIZE);
    this.compositeUniformBuffer = createUniformBuffer(device, COMPOSITE_UNIFORM_SIZE);
    this.boundaryUniformBuffer = createUniformBuffer(device, BOUNDARY_UNIFORM_SIZE);
    this.chamferUniformBuffer = createUniformBuffer(device, CHAMFER_UNIFORM_SIZE);
    this.jfaSeedUniformBuffer = createUniformBuffer(device, JFA_SEED_UNIFORM_SIZE);
    this.jfaFloodUniformBuffer = createUniformBuffer(device, JFA_FLOOD_UNIFORM_SIZE);
    this.jfaDistUniformBuffer = createUniformBuffer(device, JFA_DIST_UNIFORM_SIZE);

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

  initialize(
    video: HTMLVideoElement,
    depthWidth: number,
    depthHeight: number,
    mesh: ShapeMesh
  ): void {
    this.disposeTextures();
    this.disposeGeometryBuffers();

    this.videoAspect = video.videoWidth / video.videoHeight;
    this.meshAspect = mesh.aspect;
    this.clampDepthDimensions(depthWidth, depthHeight, this.qualityParams.depthMaxDim);

    // ---- Video texture ----
    this.videoTexture = this.device.createTexture({
      size: [video.videoWidth, video.videoHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.videoTextureView = this.videoTexture.createView();

    // ---- Depth texture (R8 source depth) ----
    this.depthTexture = this.device.createTexture({
      size: [this.depthWidth, this.depthHeight],
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.depthTextureView = this.depthTexture.createView();

    // ---- Depth Y-flip buffer ----
    this.depthFlipBuffer = new Uint8Array(this.depthWidth * this.depthHeight);

    // ---- Upload geometry ----
    this.uploadStencilMesh(mesh);
    this.uploadBoundaryMesh(mesh);
    this.uploadChamferMesh(mesh);

    // ---- Write static uniforms ----
    this.writeStaticInteriorUniforms(video.videoWidth, video.videoHeight);
    this.writeStaticCompositeUniforms();
    this.writeStaticChamferUniforms();
    this.writeStaticBoundaryUniforms();

    // Bind groups that depend on stencil/mask bind group layout + mesh scale
    // uniform will be rebuilt in recalculateViewportLayout -> rebuildBindGroups.

    this.recalculateViewportLayout();
  }

  // -----------------------------------------------------------------------
  // Pipeline creation (one per pass, all state baked at init)
  // -----------------------------------------------------------------------

  private createInteriorPipeline(): void {
    const device = this.device;

    this.interiorBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const shaderModule = device.createShaderModule({ code: INTERIOR_WGSL });

    this.interiorPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.interiorBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        // MRT: color at location 0, depth at location 1.
        targets: [
          { format: 'rgba8unorm' },
          { format: 'r8unorm' },
        ],
        constants: {
          MAX_POM_STEPS: MAX_POM_STEPS,
        },
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createStencilMarkPipeline(): void {
    const device = this.device;

    this.stencilMarkBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    const shaderModule = device.createShaderModule({ code: STENCIL_WGSL });

    this.stencilMarkPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.stencilMarkBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [MESH_POSITION_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.canvasFormat,
          // Disable color writes — only stencil matters.
          writeMask: 0x0,
        }],
      },
      primitive: { topology: 'triangle-list' },
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: {
          compare: 'always',
          passOp: 'replace',
          failOp: 'keep',
          depthFailOp: 'keep',
        },
        stencilBack: {
          compare: 'always',
          passOp: 'replace',
          failOp: 'keep',
          depthFailOp: 'keep',
        },
        stencilReadMask: 0xFF,
        stencilWriteMask: 0xFF,
      },
    });
  }

  private createCompositePipeline(): void {
    const device = this.device;

    this.compositeBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const shaderModule = device.createShaderModule({ code: COMPOSITE_WGSL });

    this.compositePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.compositeBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-strip' },
      // Stencil test: only draw where stencil == 1.
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: {
          compare: 'equal',
          passOp: 'keep',
          failOp: 'keep',
          depthFailOp: 'keep',
        },
        stencilBack: {
          compare: 'equal',
          passOp: 'keep',
          failOp: 'keep',
          depthFailOp: 'keep',
        },
        stencilReadMask: 0xFF,
        stencilWriteMask: 0x00,
      },
    });
  }

  private createChamferPipeline(): void {
    const device = this.device;

    this.chamferBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const shaderModule = device.createShaderModule({ code: CHAMFER_WGSL });

    this.chamferPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.chamferBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [CHAMFER_VERTEX_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: this.canvasFormat }],
      },
      primitive: { topology: 'triangle-list' },
      // No stencil — chamfer draws in its own geometry ring.
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
        stencilBack: { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
        stencilReadMask: 0x00,
        stencilWriteMask: 0x00,
      },
    });
  }

  private createBoundaryPipeline(): void {
    const device = this.device;

    this.boundaryBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 6, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const shaderModule = device.createShaderModule({ code: BOUNDARY_WGSL });

    this.boundaryPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.boundaryBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [BOUNDARY_VERTEX_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{
          format: this.canvasFormat,
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
      // No stencil or depth for boundary pass.
      depthStencil: {
        format: 'depth24plus-stencil8',
        depthWriteEnabled: false,
        depthCompare: 'always',
        stencilFront: { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
        stencilBack: { compare: 'always', passOp: 'keep', failOp: 'keep', depthFailOp: 'keep' },
        stencilReadMask: 0x00,
        stencilWriteMask: 0x00,
      },
    });
  }

  // ---- JFA pipelines ----

  private createMaskPipeline(): void {
    const device = this.device;

    this.maskBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      ],
    });

    const shaderModule = device.createShaderModule({ code: MASK_WGSL });

    this.maskPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.maskBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [MESH_POSITION_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'r8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  private createJFASeedPipeline(): void {
    const device = this.device;

    this.jfaSeedBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const shaderModule = device.createShaderModule({ code: JFA_SEED_WGSL });

    this.jfaSeedPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.jfaSeedBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        // JFA seed outputs vec2f -> rg16float.
        targets: [{ format: 'rg16float' }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createJFAFloodPipeline(): void {
    const device = this.device;

    this.jfaFloodBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const shaderModule = device.createShaderModule({ code: JFA_FLOOD_WGSL });

    this.jfaFloodPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.jfaFloodBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        // JFA flood propagates vec2f seed coordinates -> rg16float.
        targets: [{ format: 'rg16float' }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  private createJFADistPipeline(): void {
    const device = this.device;

    this.jfaDistBindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 4, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      ],
    });

    const shaderModule = device.createShaderModule({ code: JFA_DIST_WGSL });

    this.jfaDistPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.jfaDistBindGroupLayout] }),
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
        buffers: [FULLSCREEN_QUAD_LAYOUT],
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_main',
        // Distance output is RGBA8 (r = normalized distance).
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-strip' },
    });
  }

  // -----------------------------------------------------------------------
  // Geometry upload
  // -----------------------------------------------------------------------

  private uploadStencilMesh(mesh: ShapeMesh): void {
    this.stencilVertexBuffer = createVertexBuffer(this.device, mesh.vertices);
    this.stencilIndexBuffer = createIndexBuffer(this.device, mesh.indices);
    this.stencilIndexCount = mesh.indices.length;
  }

  private uploadBoundaryMesh(mesh: ShapeMesh): void {
    const edgeMesh = buildEdgeMesh(mesh.edgeVertices);
    if (edgeMesh.count === 0) return;
    this.boundaryVertexBuffer = createVertexBuffer(this.device, edgeMesh.vertices);
    this.boundaryVertexCount = edgeMesh.count;
  }

  private uploadChamferMesh(mesh: ShapeMesh): void {
    if (this.config.chamferWidth <= 0) return;

    const chamferMesh = buildChamferMesh(
      mesh.edgeVertices,
      mesh.contourOffsets,
      mesh.contourIsHole,
      this.config.chamferWidth,
      this.config.chamferAngle,
    );
    if (chamferMesh.count === 0) return;
    this.chamferVertexBuffer = createVertexBuffer(this.device, chamferMesh.vertices);
    this.chamferVertexCount = chamferMesh.count;
  }

  // -----------------------------------------------------------------------
  // Static uniform writes (called once at init, not per-frame)
  // -----------------------------------------------------------------------

  private writeStaticInteriorUniforms(videoWidth: number, videoHeight: number): void {
    const buf = new ArrayBuffer(INTERIOR_FRAGMENT_UNIFORM_SIZE);
    const f32 = new Float32Array(buf);
    const i32 = new Int32Array(buf);

    // offset.x, offset.y — updated per-frame, zeroed initially
    f32[0] = 0;
    f32[1] = 0;
    f32[2] = this.config.parallaxStrength;
    i32[3] = this.config.pomSteps;
    f32[4] = this.config.depthPower;
    f32[5] = this.config.depthScale;
    f32[6] = this.config.depthBias;
    f32[7] = this.config.contrastLow;
    f32[8] = this.config.contrastHigh;
    f32[9] = this.config.verticalReduction;
    f32[10] = this.config.dofStart;
    f32[11] = this.config.dofStrength;
    f32[12] = 1.0 / videoWidth;  // imageTexelSize.x
    f32[13] = 1.0 / videoHeight; // imageTexelSize.y
    f32[14] = this.config.fogDensity;
    // f32[15] is padding before fogColor (vec3f aligned to 16 bytes)
    f32[16] = this.config.fogColor[0]; // fogColor.r @ offset 64
    f32[17] = this.config.fogColor[1]; // fogColor.g
    f32[18] = this.config.fogColor[2]; // fogColor.b
    f32[19] = this.config.colorShift;
    f32[20] = this.config.brightnessBias;

    this.device.queue.writeBuffer(this.interiorFragmentUniformBuffer!, 0, buf);
  }

  private writeStaticCompositeUniforms(): void {
    this.device.queue.writeBuffer(
      this.compositeUniformBuffer!,
      0,
      new Float32Array([
        this.config.edgeOcclusionWidth,
        this.config.edgeOcclusionStrength,
        0, 0, // padding to 16 bytes
      ]),
    );
  }

  private writeStaticChamferUniforms(): void {
    const buf = new ArrayBuffer(CHAMFER_UNIFORM_SIZE);
    const f32 = new Float32Array(buf);

    f32[0] = this.lightDir3[0]; // lightDir3.x
    f32[1] = this.lightDir3[1]; // lightDir3.y
    f32[2] = this.lightDir3[2]; // lightDir3.z
    // f32[3] is padding (align chamferColor to 16)
    f32[4] = this.config.chamferColor[0]; // chamferColor.r
    f32[5] = this.config.chamferColor[1]; // chamferColor.g
    f32[6] = this.config.chamferColor[2]; // chamferColor.b
    f32[7] = this.config.chamferAmbient;
    f32[8] = this.config.chamferSpecular;
    f32[9] = this.config.chamferShininess;
    // meshScale + texelSize written per resize
    f32[10] = this.meshScaleX;
    f32[11] = this.meshScaleY;
    f32[12] = 0; // texelSize.x — updated on resize
    f32[13] = 0; // texelSize.y — updated on resize

    this.device.queue.writeBuffer(this.chamferUniformBuffer!, 0, buf);
  }

  private writeStaticBoundaryUniforms(): void {
    const buf = new ArrayBuffer(BOUNDARY_UNIFORM_SIZE);
    const f32 = new Float32Array(buf);

    f32[0] = this.config.rimLightWidth;  // rimWidth
    // f32[1] is padding (align meshScale to 8)
    f32[2] = this.meshScaleX;            // meshScale.x — updated on resize
    f32[3] = this.meshScaleY;            // meshScale.y — updated on resize
    f32[4] = this.config.rimLightIntensity; // rimIntensity
    // f32[5..7] padding (align rimColor to 16 = byte 32)
    f32[8] = this.config.rimLightColor[0]; // rimColor.r @ byte 32
    f32[9] = this.config.rimLightColor[1]; // rimColor.g
    f32[10] = this.config.rimLightColor[2]; // rimColor.b
    f32[11] = this.config.refractionStrength;
    f32[12] = this.config.chromaticStrength;
    f32[13] = this.config.occlusionIntensity;
    f32[14] = 0; // texelSize.x — updated on resize
    f32[15] = 0; // texelSize.y — updated on resize
    f32[16] = this.config.edgeThickness;
    f32[17] = this.config.edgeSpecular;
    // f32[18..19] padding (align edgeColor to 16 = byte 80)
    f32[20] = this.config.edgeColor[0]; // edgeColor.r @ byte 80
    f32[21] = this.config.edgeColor[1]; // edgeColor.g
    f32[22] = this.config.edgeColor[2]; // edgeColor.b
    // f32[23] padding (align lightDir to 8 = byte 96)
    f32[24] = this.lightDirX;           // lightDir.x @ byte 96
    f32[25] = this.lightDirY;           // lightDir.y
    f32[26] = this.config.bevelIntensity;

    this.device.queue.writeBuffer(this.boundaryUniformBuffer!, 0, buf);
  }

  // -----------------------------------------------------------------------
  // Bind group creation / rebuild
  // -----------------------------------------------------------------------

  private rebuildInteriorBindGroup(): void {
    if (
      !this.interiorBindGroupLayout ||
      !this.interiorVertexUniformBuffer ||
      !this.interiorFragmentUniformBuffer ||
      !this.videoTextureView ||
      !this.depthTextureView ||
      !this.linearSampler
    ) return;

    this.interiorBindGroup = this.device.createBindGroup({
      layout: this.interiorBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.interiorVertexUniformBuffer } },
        { binding: 1, resource: { buffer: this.interiorFragmentUniformBuffer } },
        { binding: 2, resource: this.videoTextureView },
        { binding: 3, resource: this.linearSampler },
        { binding: 4, resource: this.depthTextureView },
        { binding: 5, resource: this.linearSampler },
      ],
    });
  }

  private rebuildStencilMarkBindGroup(): void {
    if (!this.stencilMarkBindGroupLayout || !this.meshScaleUniformBuffer) return;

    this.stencilMarkBindGroup = this.device.createBindGroup({
      layout: this.stencilMarkBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.meshScaleUniformBuffer } },
      ],
    });
  }

  private rebuildCompositeBindGroup(): void {
    if (
      !this.compositeBindGroupLayout ||
      !this.compositeUniformBuffer ||
      !this.interiorColorView ||
      !this.linearSampler
    ) return;

    // Distance field may not exist yet (first resize before JFA runs).
    // Use a 1x1 fallback — the shader will just sample a constant.
    const distView = this.jfaDistView ?? this.createFallbackTextureView('rgba8unorm');

    this.compositeBindGroup = this.device.createBindGroup({
      layout: this.compositeBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.compositeUniformBuffer } },
        { binding: 1, resource: this.interiorColorView },
        { binding: 2, resource: this.linearSampler },
        { binding: 3, resource: distView },
        { binding: 4, resource: this.linearSampler },
      ],
    });
  }

  private rebuildChamferBindGroup(): void {
    if (
      !this.chamferBindGroupLayout ||
      !this.chamferUniformBuffer ||
      !this.interiorColorView ||
      !this.linearSampler
    ) return;

    this.chamferBindGroup = this.device.createBindGroup({
      layout: this.chamferBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.chamferUniformBuffer } },
        { binding: 1, resource: this.interiorColorView },
        { binding: 2, resource: this.linearSampler },
      ],
    });
  }

  private rebuildBoundaryBindGroup(): void {
    if (
      !this.boundaryBindGroupLayout ||
      !this.boundaryUniformBuffer ||
      !this.interiorColorView ||
      !this.interiorDepthView ||
      !this.linearSampler
    ) return;

    const distView = this.jfaDistView ?? this.createFallbackTextureView('rgba8unorm');

    this.boundaryBindGroup = this.device.createBindGroup({
      layout: this.boundaryBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.boundaryUniformBuffer } },
        { binding: 1, resource: this.interiorColorView },
        { binding: 2, resource: this.linearSampler },
        { binding: 3, resource: this.interiorDepthView },
        { binding: 4, resource: this.linearSampler },
        { binding: 5, resource: distView },
        { binding: 6, resource: this.linearSampler },
      ],
    });
  }

  private rebuildMaskBindGroup(): void {
    if (!this.maskBindGroupLayout || !this.meshScaleUniformBuffer) return;

    this.maskBindGroup = this.device.createBindGroup({
      layout: this.maskBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.meshScaleUniformBuffer } },
      ],
    });
  }

  private rebuildJFASeedBindGroup(): void {
    if (
      !this.jfaSeedBindGroupLayout ||
      !this.jfaMaskView ||
      !this.linearSampler ||
      !this.jfaSeedUniformBuffer
    ) return;

    this.jfaSeedBindGroup = this.device.createBindGroup({
      layout: this.jfaSeedBindGroupLayout,
      entries: [
        { binding: 0, resource: this.jfaMaskView },
        { binding: 1, resource: this.linearSampler },
        { binding: 2, resource: { buffer: this.jfaSeedUniformBuffer } },
      ],
    });
  }

  private rebuildJFADistBindGroup(): void {
    if (
      !this.jfaDistBindGroupLayout ||
      !this.jfaDistUniformBuffer ||
      !this.jfaMaskView ||
      !this.linearSampler
    ) return;

    // The seed texture to read from is determined after flood iterations.
    // This bind group is rebuilt in computeDistanceField after knowing
    // which ping/pong texture holds the final seed data.
    // For now, use ping as a placeholder.
    const seedView = this.jfaPingView ?? this.jfaPongView;
    if (!seedView) return;

    this.jfaDistBindGroup = this.device.createBindGroup({
      layout: this.jfaDistBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.jfaDistUniformBuffer } },
        { binding: 1, resource: seedView },
        { binding: 2, resource: this.nearestSampler! },
        { binding: 3, resource: this.jfaMaskView },
        { binding: 4, resource: this.linearSampler },
      ],
    });
  }

  /** Rebuild all bind groups that reference textures (after resize or init). */
  private rebuildBindGroups(): void {
    this.rebuildInteriorBindGroup();
    this.rebuildStencilMarkBindGroup();
    this.rebuildCompositeBindGroup();
    this.rebuildChamferBindGroup();
    this.rebuildBoundaryBindGroup();
    this.rebuildMaskBindGroup();
    this.rebuildJFASeedBindGroup();
    this.rebuildJFADistBindGroup();
  }

  // -----------------------------------------------------------------------
  // FBO / offscreen texture management
  // -----------------------------------------------------------------------

  private createInteriorFBO(width: number, height: number): void {
    this.disposeInteriorFBO();
    this.fboWidth = width;
    this.fboHeight = height;

    // Color attachment (rgba8unorm).
    this.interiorColorTexture = this.device.createTexture({
      size: [width, height],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.interiorColorView = this.interiorColorTexture.createView();

    // Depth attachment (r8unorm — lens-transformed depth, not z-buffer).
    this.interiorDepthTexture = this.device.createTexture({
      size: [width, height],
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.interiorDepthView = this.interiorDepthTexture.createView();
  }

  private createDepthStencilTexture(width: number, height: number): void {
    this.disposeDepthStencilTexture();
    this.dsWidth = width;
    this.dsHeight = height;

    this.depthStencilTexture = this.device.createTexture({
      size: [width, height],
      format: 'depth24plus-stencil8',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.depthStencilView = this.depthStencilTexture.createView();
  }

  private createJFAResources(canvasWidth: number, canvasHeight: number): void {
    this.disposeJFAResources();

    const jfaDiv = this.qualityParams.jfaDivisor;
    const w = Math.max(1, Math.round(canvasWidth / jfaDiv));
    const h = Math.max(1, Math.round(canvasHeight / jfaDiv));
    this.jfaWidth = w;
    this.jfaHeight = h;

    // Binary mask (r8unorm).
    this.jfaMaskTexture = this.device.createTexture({
      size: [w, h],
      format: 'r8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.jfaMaskView = this.jfaMaskTexture.createView();

    // JFA ping-pong (rg16float — WebGPU supports float render targets natively).
    this.jfaPingTexture = this.device.createTexture({
      size: [w, h],
      format: 'rg16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.jfaPingView = this.jfaPingTexture.createView();

    this.jfaPongTexture = this.device.createTexture({
      size: [w, h],
      format: 'rg16float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.jfaPongView = this.jfaPongTexture.createView();

    // Final distance texture (rgba8unorm).
    this.jfaDistTexture = this.device.createTexture({
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.jfaDistView = this.jfaDistTexture.createView();

    this.jfaDirty = true;
  }

  // -----------------------------------------------------------------------
  // JFA distance field computation (runs once on resize, not per frame)
  // -----------------------------------------------------------------------

  private computeDistanceField(encoder: GPUCommandEncoder): void {
    if (
      !this.maskPipeline || !this.jfaSeedPipeline ||
      !this.jfaFloodPipeline || !this.jfaDistPipeline ||
      !this.stencilVertexBuffer || !this.stencilIndexBuffer ||
      !this.quadBuffer || !this.jfaMaskView || !this.jfaPingView ||
      !this.jfaPongView || !this.jfaDistView || !this.maskBindGroup ||
      !this.jfaSeedBindGroup || !this.jfaFloodBindGroupLayout ||
      !this.jfaDistBindGroupLayout || !this.nearestSampler ||
      !this.linearSampler || !this.jfaMaskView
    ) return;

    const w = this.jfaWidth;
    const h = this.jfaHeight;
    if (w === 0 || h === 0) return;

    // --- Step 1: Render binary mask ---
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.jfaMaskView,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.maskPipeline);
      pass.setBindGroup(0, this.maskBindGroup);
      pass.setVertexBuffer(0, this.stencilVertexBuffer);
      pass.setIndexBuffer(this.stencilIndexBuffer, 'uint16');
      pass.drawIndexed(this.stencilIndexCount);
      pass.end();
    }

    // --- Step 2: Seed extraction ---
    // Write JFA seed uniforms (texel size).
    this.device.queue.writeBuffer(
      this.jfaSeedUniformBuffer!,
      0,
      new Float32Array([1.0 / w, 1.0 / h, 0, 0]),
    );
    // Rebuild the seed bind group in case mask texture changed.
    this.rebuildJFASeedBindGroup();

    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.jfaPingView,
          clearValue: { r: -1, g: -1, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.jfaSeedPipeline);
      pass.setBindGroup(0, this.jfaSeedBindGroup!);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    // --- Step 3: JFA flood iterations ---
    const iterations = JFADistanceField.computeFloodIterations(w, h);

    let readView = this.jfaPingView;
    let writeView = this.jfaPongView;

    for (let i = 0; i < iterations.length; i++) {
      const stepSizeUv = iterations[i] / Math.max(w, h);

      // Write flood uniforms for this iteration.
      this.device.queue.writeBuffer(
        this.jfaFloodUniformBuffer!,
        0,
        new Float32Array([1.0 / w, 1.0 / h, stepSizeUv, 0]),
      );

      // Create a bind group for this iteration referencing the current read texture.
      const floodBindGroup = this.device.createBindGroup({
        layout: this.jfaFloodBindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.jfaFloodUniformBuffer! } },
          { binding: 1, resource: readView },
          { binding: 2, resource: this.nearestSampler },
        ],
      });

      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: writeView,
          loadOp: 'clear',
          clearValue: { r: -1, g: -1, b: 0, a: 0 },
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.jfaFloodPipeline);
      pass.setBindGroup(0, floodBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();

      // Swap ping-pong.
      const tmp = readView;
      readView = writeView;
      writeView = tmp;
    }

    // readView now holds the final seed coordinates.

    // --- Step 4: Distance conversion ---
    const distRange = Math.max(this.config.bevelWidth, this.config.edgeOcclusionWidth);
    this.device.queue.writeBuffer(
      this.jfaDistUniformBuffer!,
      0,
      new Float32Array([1.0 / w, 1.0 / h, distRange, 0]),
    );

    // Rebuild dist bind group with the correct final seed texture.
    const distBindGroup = this.device.createBindGroup({
      layout: this.jfaDistBindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.jfaDistUniformBuffer! } },
        { binding: 1, resource: readView },
        { binding: 2, resource: this.nearestSampler },
        { binding: 3, resource: this.jfaMaskView },
        { binding: 4, resource: this.linearSampler },
      ],
    });

    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: this.jfaDistView!,
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
      });
      pass.setPipeline(this.jfaDistPipeline);
      pass.setBindGroup(0, distBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    this.jfaDirty = false;

    // Rebuild bind groups that reference the distance field texture.
    this.rebuildCompositeBindGroup();
    this.rebuildBoundaryBindGroup();
  }

  // -----------------------------------------------------------------------
  // Depth Y-flip
  // -----------------------------------------------------------------------

  /**
   * Flip depth data vertically.
   *
   * WebGPU writeTexture has no UNPACK_FLIP_Y_WEBGL equivalent. Video frames
   * are imported with flipY:true via copyExternalImageToTexture, so depth
   * data must also be flipped to maintain spatial alignment.
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
  // Fallback texture (1x1 black, for bind groups before JFA runs)
  // -----------------------------------------------------------------------

  private fallbackTexture: GPUTexture | null = null;

  private createFallbackTextureView(format: GPUTextureFormat): GPUTextureView {
    if (!this.fallbackTexture) {
      this.fallbackTexture = this.device.createTexture({
        size: [1, 1],
        format,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      });
      // Write black pixel.
      this.device.queue.writeTexture(
        { texture: this.fallbackTexture },
        new Uint8Array([0, 0, 0, 0]) as unknown as ArrayBuffer,
        { bytesPerRow: 4 },
        { width: 1, height: 1 },
      );
    }
    return this.fallbackTexture.createView();
  }

  // -----------------------------------------------------------------------
  // Abstract method implementations (RendererBase)
  // -----------------------------------------------------------------------

  /**
   * Main render loop -- 6 draw calls per frame.
   *
   * Pass 1: Interior -> MRT offscreen textures.
   * Pass 2a: Stencil mark -> depth-stencil attachment.
   * Pass 2b: Composite -> canvas (stencil-tested).
   * Pass 2c: Chamfer geometry -> canvas.
   * Pass 3: Boundary effects -> canvas (alpha blended).
   * JFA: runs inside command encoder when dirty (cached on resize).
   */
  protected onRenderFrame(): void {
    const video = this.playbackVideo;
    if (
      !this.context ||
      !this.interiorPipeline ||
      !this.interiorBindGroup ||
      !this.quadBuffer
    ) return;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (!this.interiorColorView || !this.interiorDepthView) return;

    // Upload video frame.
    if (this.videoTexture) {
      importVideoFrame(this.device, this.videoTexture, video);
    }

    // Fallback depth update when RVFC is not available.
    if (!this.rvfcSupported) {
      this.onDepthUpdate(video.currentTime);
    }

    // Read input.
    if (this.readInput) {
      const input = this.readInput();
      this.offsetData[0] = -input.x;
      this.offsetData[1] = input.y;
      // Write only the first 8 bytes (offset vec2f) of the fragment uniform buffer.
      this.device.queue.writeBuffer(this.interiorFragmentUniformBuffer!, 0, this.offsetData);
    }

    const encoder = this.device.createCommandEncoder();

    // Compute JFA distance field if dirty (runs once on resize, cached).
    if (this.jfaDirty && this.stencilVertexBuffer && this.stencilIndexBuffer) {
      this.computeDistanceField(encoder);
    }

    // ==========================
    // PASS 1: Interior -> MRT FBO
    // ==========================
    {
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: this.interiorColorView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
          {
            view: this.interiorDepthView,
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      pass.setPipeline(this.interiorPipeline);
      pass.setBindGroup(0, this.interiorBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    // ==========================
    // PASS 2: Backbuffer (stencil + composite + chamfer + boundary)
    // ==========================
    const canvasView = this.context.getCurrentTexture().createView();

    // All backbuffer passes share the same depth-stencil attachment so
    // the stencil state persists across sub-passes within this render pass.
    // WebGPU requires that we start a new render pass for each sub-pass
    // with different pipeline state, but we reuse the depth-stencil texture.

    // PASS 2a: Stencil mark.
    if (
      this.stencilMarkPipeline &&
      this.stencilMarkBindGroup &&
      this.stencilVertexBuffer &&
      this.stencilIndexBuffer &&
      this.stencilIndexCount > 0 &&
      this.depthStencilView
    ) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: canvasView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: this.depthStencilView,
          stencilClearValue: 0,
          stencilLoadOp: 'clear',
          stencilStoreOp: 'store',
          depthClearValue: 1.0,
          depthLoadOp: 'clear',
          depthStoreOp: 'discard',
        },
      });
      pass.setStencilReference(1);
      pass.setPipeline(this.stencilMarkPipeline);
      pass.setBindGroup(0, this.stencilMarkBindGroup);
      pass.setVertexBuffer(0, this.stencilVertexBuffer);
      pass.setIndexBuffer(this.stencilIndexBuffer, 'uint16');
      pass.drawIndexed(this.stencilIndexCount);
      pass.end();
    }

    // PASS 2b: Composite (stencil-tested).
    if (this.compositePipeline && this.compositeBindGroup && this.depthStencilView) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: canvasView,
          loadOp: 'load',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: this.depthStencilView,
          stencilLoadOp: 'load',
          stencilStoreOp: 'store',
          depthLoadOp: 'load',
          depthStoreOp: 'discard',
        },
      });
      pass.setStencilReference(1);
      pass.setPipeline(this.compositePipeline);
      pass.setBindGroup(0, this.compositeBindGroup);
      pass.setVertexBuffer(0, this.quadBuffer);
      pass.draw(4);
      pass.end();
    }

    // PASS 2c: Chamfer geometry (no stencil test, opaque).
    if (
      this.chamferPipeline &&
      this.chamferBindGroup &&
      this.chamferVertexBuffer &&
      this.chamferVertexCount > 0 &&
      this.depthStencilView
    ) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: canvasView,
          loadOp: 'load',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: this.depthStencilView,
          stencilLoadOp: 'load',
          stencilStoreOp: 'store',
          depthLoadOp: 'load',
          depthStoreOp: 'discard',
        },
      });
      pass.setPipeline(this.chamferPipeline);
      pass.setBindGroup(0, this.chamferBindGroup);
      pass.setVertexBuffer(0, this.chamferVertexBuffer);
      pass.draw(this.chamferVertexCount);
      pass.end();
    }

    // ==========================
    // PASS 3: Boundary effects (alpha blended)
    // ==========================
    if (
      this.boundaryPipeline &&
      this.boundaryBindGroup &&
      this.boundaryVertexBuffer &&
      this.boundaryVertexCount > 0 &&
      this.config.rimLightIntensity > 0 &&
      this.depthStencilView
    ) {
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: canvasView,
          loadOp: 'load',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: this.depthStencilView,
          stencilLoadOp: 'load',
          stencilStoreOp: 'store',
          depthLoadOp: 'load',
          depthStoreOp: 'discard',
        },
      });
      pass.setPipeline(this.boundaryPipeline);
      pass.setBindGroup(0, this.boundaryBindGroup);
      pass.setVertexBuffer(0, this.boundaryVertexBuffer);
      pass.draw(this.boundaryVertexCount);
      pass.end();
    }

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * Upload depth data to the GPU texture.
   * Called from the RVFC loop at video frame rate, or from RAF fallback.
   */
  protected onDepthUpdate(timeSec: number): void {
    if (!this.readDepth || !this.depthTexture) return;

    const subsampled = this.subsampleDepth(this.readDepth(timeSec));
    const depthData = this.flipDepthY(subsampled);

    this.device.queue.writeTexture(
      { texture: this.depthTexture },
      depthData as unknown as ArrayBuffer,
      { bytesPerRow: this.depthWidth },
      { width: this.depthWidth, height: this.depthHeight },
    );
  }

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

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

    // Resize interior FBO.
    if (this.fboWidth !== bufferWidth || this.fboHeight !== bufferHeight) {
      this.createInteriorFBO(bufferWidth, bufferHeight);
    }

    // Resize depth-stencil attachment.
    if (this.dsWidth !== bufferWidth || this.dsHeight !== bufferHeight) {
      this.createDepthStencilTexture(bufferWidth, bufferHeight);
    }

    // Resize JFA resources at reduced resolution.
    const jfaDiv = this.qualityParams.jfaDivisor;
    const jfaW = Math.max(1, Math.round(bufferWidth / jfaDiv));
    const jfaH = Math.max(1, Math.round(bufferHeight / jfaDiv));
    if (this.jfaWidth !== jfaW || this.jfaHeight !== jfaH) {
      this.createJFAResources(bufferWidth, bufferHeight);
    }

    // Cover-fit UV transform.
    this.computeCoverFitUV(this.config.parallaxStrength, this.config.overscanPadding);

    // Update vertex uniform buffer.
    if (this.interiorVertexUniformBuffer) {
      this.device.queue.writeBuffer(
        this.interiorVertexUniformBuffer,
        0,
        new Float32Array([
          this.uvOffset[0], this.uvOffset[1],
          this.uvScale[0], this.uvScale[1],
        ]),
      );
    }

    // Mesh scale.
    const viewportAspect = width / height;
    const fillFactor = 0.65;
    this.meshScaleX = fillFactor;
    this.meshScaleY = fillFactor;
    if (viewportAspect > this.meshAspect) {
      this.meshScaleX = fillFactor * (this.meshAspect / viewportAspect);
    } else {
      this.meshScaleY = fillFactor * (viewportAspect / this.meshAspect);
    }

    // Write mesh scale uniform (shared by stencil/mask).
    if (this.meshScaleUniformBuffer) {
      this.device.queue.writeBuffer(
        this.meshScaleUniformBuffer,
        0,
        new Float32Array([this.meshScaleX, this.meshScaleY, 0, 0]),
      );
    }

    // Update viewport-dependent uniforms in boundary buffer.
    if (this.boundaryUniformBuffer) {
      // rimWidth @ offset 0 (already written)
      // meshScale @ offset 8
      this.device.queue.writeBuffer(
        this.boundaryUniformBuffer,
        8,
        new Float32Array([this.meshScaleX, this.meshScaleY]),
      );
      // texelSize @ offset 56
      this.device.queue.writeBuffer(
        this.boundaryUniformBuffer,
        56,
        new Float32Array([1.0 / bufferWidth, 1.0 / bufferHeight]),
      );
    }

    // Update viewport-dependent uniforms in chamfer buffer.
    if (this.chamferUniformBuffer) {
      // meshScale @ offset 40
      this.device.queue.writeBuffer(
        this.chamferUniformBuffer,
        40,
        new Float32Array([this.meshScaleX, this.meshScaleY]),
      );
      // texelSize @ offset 48
      this.device.queue.writeBuffer(
        this.chamferUniformBuffer,
        48,
        new Float32Array([1.0 / bufferWidth, 1.0 / bufferHeight]),
      );
    }

    // Mark JFA as dirty so it recomputes on next frame.
    this.jfaDirty = true;

    // Rebuild all bind groups (textures may have been recreated).
    this.rebuildBindGroups();
  }

  // -----------------------------------------------------------------------
  // Context loss
  // -----------------------------------------------------------------------

  /**
   * WebGPU device loss recovery.
   *
   * Device loss is handled via the `device.lost` promise (set in constructor).
   * Full recovery requires re-requesting adapter + device, which is managed
   * at the Web Component level by re-creating the renderer.
   */
  protected onContextRestored(): void {
    // No-op for WebGPU -- device loss is handled at a higher level.
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  protected disposeRenderer(): void {
    this.disposeTextures();
    this.disposeInteriorFBO();
    this.disposeDepthStencilTexture();
    this.disposeJFAResources();
    this.disposeGeometryBuffers();

    // Destroy uniform buffers.
    this.meshScaleUniformBuffer?.destroy();
    this.meshScaleUniformBuffer = null;
    this.interiorVertexUniformBuffer?.destroy();
    this.interiorVertexUniformBuffer = null;
    this.interiorFragmentUniformBuffer?.destroy();
    this.interiorFragmentUniformBuffer = null;
    this.compositeUniformBuffer?.destroy();
    this.compositeUniformBuffer = null;
    this.boundaryUniformBuffer?.destroy();
    this.boundaryUniformBuffer = null;
    this.chamferUniformBuffer?.destroy();
    this.chamferUniformBuffer = null;
    this.jfaSeedUniformBuffer?.destroy();
    this.jfaSeedUniformBuffer = null;
    this.jfaFloodUniformBuffer?.destroy();
    this.jfaFloodUniformBuffer = null;
    this.jfaDistUniformBuffer?.destroy();
    this.jfaDistUniformBuffer = null;

    // Destroy shared resources.
    this.quadBuffer?.destroy();
    this.quadBuffer = null;
    this.linearSampler = null;
    this.nearestSampler = null;

    // Destroy fallback texture.
    this.fallbackTexture?.destroy();
    this.fallbackTexture = null;

    // Nullify pipeline/bind group references (GC'd by WebGPU).
    this.interiorPipeline = null;
    this.interiorBindGroupLayout = null;
    this.interiorBindGroup = null;
    this.stencilMarkPipeline = null;
    this.stencilMarkBindGroupLayout = null;
    this.stencilMarkBindGroup = null;
    this.compositePipeline = null;
    this.compositeBindGroupLayout = null;
    this.compositeBindGroup = null;
    this.chamferPipeline = null;
    this.chamferBindGroupLayout = null;
    this.chamferBindGroup = null;
    this.boundaryPipeline = null;
    this.boundaryBindGroupLayout = null;
    this.boundaryBindGroup = null;
    this.maskPipeline = null;
    this.maskBindGroupLayout = null;
    this.maskBindGroup = null;
    this.jfaSeedPipeline = null;
    this.jfaSeedBindGroupLayout = null;
    this.jfaSeedBindGroup = null;
    this.jfaFloodPipeline = null;
    this.jfaFloodBindGroupLayout = null;
    this.jfaDistPipeline = null;
    this.jfaDistBindGroupLayout = null;
    this.jfaDistBindGroup = null;

    // Unconfigure canvas.
    if (this.context) {
      this.context.unconfigure();
      this.context = null;
    }

    this.depthFlipBuffer = null;
  }

  private disposeTextures(): void {
    this.videoTexture?.destroy();
    this.videoTexture = null;
    this.videoTextureView = null;

    this.depthTexture?.destroy();
    this.depthTexture = null;
    this.depthTextureView = null;

    // Invalidate bind groups that reference destroyed textures.
    this.interiorBindGroup = null;
  }

  private disposeInteriorFBO(): void {
    this.interiorColorTexture?.destroy();
    this.interiorColorTexture = null;
    this.interiorColorView = null;

    this.interiorDepthTexture?.destroy();
    this.interiorDepthTexture = null;
    this.interiorDepthView = null;

    this.fboWidth = 0;
    this.fboHeight = 0;

    // Invalidate bind groups referencing FBO textures.
    this.compositeBindGroup = null;
    this.chamferBindGroup = null;
    this.boundaryBindGroup = null;
  }

  private disposeDepthStencilTexture(): void {
    this.depthStencilTexture?.destroy();
    this.depthStencilTexture = null;
    this.depthStencilView = null;
    this.dsWidth = 0;
    this.dsHeight = 0;
  }

  private disposeJFAResources(): void {
    this.jfaMaskTexture?.destroy();
    this.jfaMaskTexture = null;
    this.jfaMaskView = null;

    this.jfaPingTexture?.destroy();
    this.jfaPingTexture = null;
    this.jfaPingView = null;

    this.jfaPongTexture?.destroy();
    this.jfaPongTexture = null;
    this.jfaPongView = null;

    this.jfaDistTexture?.destroy();
    this.jfaDistTexture = null;
    this.jfaDistView = null;

    this.jfaWidth = 0;
    this.jfaHeight = 0;
    this.jfaDirty = true;

    // Invalidate JFA bind groups.
    this.jfaSeedBindGroup = null;
    this.jfaDistBindGroup = null;
  }

  private disposeGeometryBuffers(): void {
    this.stencilVertexBuffer?.destroy();
    this.stencilVertexBuffer = null;
    this.stencilIndexBuffer?.destroy();
    this.stencilIndexBuffer = null;
    this.stencilIndexCount = 0;

    this.boundaryVertexBuffer?.destroy();
    this.boundaryVertexBuffer = null;
    this.boundaryVertexCount = 0;

    this.chamferVertexBuffer?.destroy();
    this.chamferVertexBuffer = null;
    this.chamferVertexCount = 0;

    // Invalidate bind groups referencing geometry.
    this.stencilMarkBindGroup = null;
    this.maskBindGroup = null;
  }
}
