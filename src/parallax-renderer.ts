/**
 * Parallax Renderer — GPU-accelerated depth-aware video parallax.
 *
 * Renders a single fullscreen quad textured with the source video
 * and a precomputed depth map using pure WebGL 2. A custom fragment
 * shader displaces UV coordinates per-pixel based on the depth value
 * and current mouse/gyro input, creating a continuous parallax effect
 * with no discrete layer banding.
 *
 * ## Multi-pass architecture
 *
 * The renderer uses a pass-based pipeline where each render pass is a
 * self-contained unit with its own shader program and uniform cache,
 * sharing a single fullscreen quad VAO and depth textures:
 *
 * 1. **Bilateral filter pass** — edge-preserving depth smoothing.
 *    Reads raw depth (UNIT 2), writes filtered depth (UNIT 1) via FBO.
 *    Runs at RVFC rate (~5fps, only when depth data changes).
 *
 * 2. **Parallax pass** — per-pixel depth-based displacement.
 *    Reads video (UNIT 0) + filtered depth (UNIT 1), renders to screen.
 *    Runs at RAF rate (60-120fps).
 *
 * Each pass is created by a factory function and conforms to a minimal
 * interface. Adding a new post-processing pass requires only a new
 * factory function and wiring it into the render loop.
 *
 * ## Texture memory
 *
 * 3 textures total: 1 video (RGBA), 1 raw depth (R8), 1 filtered depth (R8).
 * The raw depth texture is uploaded from CPU when depth changes (~5fps).
 * The filtered depth texture is rendered via FBO bilateral filter pass.
 */

import {
  compileShader,
  linkProgram,
  getUniformLocations,
  createFullscreenQuadVao,
} from './webgl-utils';
import type { RenderPass, FBOPass, TextureSlot } from './render-pass';
import { TextureRegistry } from './render-pass';
import type { QualityTier } from './quality';
import { resolveQuality } from './quality';
import { RendererBase } from './renderer-base';
import type { MediaSource } from './media-source';

// ---------------------------------------------------------------------------
// GLSL Shaders (imported from external files via Vite ?raw)
// ---------------------------------------------------------------------------

import VERTEX_SHADER from './shaders/parallax/vertex.vert.glsl?raw';
import BILATERAL_VERTEX_SHADER from './shaders/parallax/bilateral.vert.glsl?raw';
import BILATERAL_FRAGMENT_SHADER from './shaders/parallax/bilateral.frag.glsl?raw';
import FRAGMENT_SHADER from './shaders/parallax/fragment.frag.glsl?raw';

// ---------------------------------------------------------------------------
// Configuration interface
// ---------------------------------------------------------------------------

/** Configuration subset relevant to the parallax renderer. */
export interface ParallaxRendererConfig {
  parallaxStrength: number;
  pomEnabled: boolean;
  pomSteps: number;
  overscanPadding: number;

  /**
   * Adaptive quality tier. Controls render resolution, depth resolution,
   * sample counts, and bilateral kernel size.
   * - 'auto' — probe device capabilities and classify automatically.
   * - 'high' / 'medium' / 'low' — use the specified tier directly.
   * - undefined — defaults to 'auto'.
   */
  quality?: 'auto' | QualityTier;

  /**
   * Depth-adaptive shader parameters.
   * When omitted, calibrated defaults matching the current hardcoded values
   * are used. When provided, the explicit value overrides the derived value.
   */
  contrastLow?: number;
  contrastHigh?: number;
  verticalReduction?: number;
  dofStart?: number;
  dofStrength?: number;
}

/**
 * Resolved config with all optional fields filled. Internal only.
 * Defaults match the exact current hardcoded production values.
 */
interface ResolvedParallaxRendererConfig {
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

/** Calibrated defaults for the 5 new shader parameters. */
const SHADER_PARAM_DEFAULTS = {
  contrastLow: 0.05,
  contrastHigh: 0.95,
  verticalReduction: 0.5,
  dofStart: 0.6,
  dofStrength: 0.4,
} as const;

// ---------------------------------------------------------------------------
// Render pass types (extend shared framework interfaces)
// ---------------------------------------------------------------------------

/**
 * Bilateral filter pass — extends shared FBOPass with pass-specific methods.
 *
 * The base FBOPass provides program, uniforms, fbo, outputs, resize, dispose.
 * This adds `initFBO()` and `execute()` which have bilateral-specific signatures.
 */
type BilateralFilterPass = FBOPass & {
  /** Create FBO targeting filteredDepthTexture and set static uniforms. */
  initFBO(
    gl: WebGL2RenderingContext,
    filteredDepthTexture: WebGLTexture,
    depthWidth: number,
    depthHeight: number
  ): void;

  /**
   * Upload raw depth and run the bilateral filter shader.
   *
   * 1. Upload depthData to rawDepthTexture (UNIT 2).
   * 2. Bind FBO → draw → unbind FBO.
   * 3. Restore viewport to canvas size.
   */
  execute(
    gl: WebGL2RenderingContext,
    quadVao: WebGLVertexArrayObject,
    rawDepthTexture: WebGLTexture,
    depthData: Uint8Array,
    depthWidth: number,
    depthHeight: number,
    canvasWidth: number,
    canvasHeight: number
  ): void;
};

/**
 * Parallax rendering pass — extends shared RenderPass with pass-specific methods.
 *
 * The base RenderPass provides program, uniforms, dispose.
 * This adds `setStaticUniforms()` and `updateUvTransform()`.
 */
type ParallaxPass = RenderPass & {
  /** Set static uniforms (strength, POM, contrast, DOF, texel size). */
  setStaticUniforms(
    gl: WebGL2RenderingContext,
    config: ResolvedParallaxRendererConfig,
    videoWidth: number,
    videoHeight: number
  ): void;

  /** Update the UV transform uniforms on resize. */
  updateUvTransform(
    gl: WebGL2RenderingContext,
    uvOffset: readonly number[],
    uvScale: readonly number[]
  ): void;
};

// ---------------------------------------------------------------------------
// Bilateral filter pass factory
// ---------------------------------------------------------------------------

/** Uniform names for the bilateral filter shader. */
const BILATERAL_UNIFORM_NAMES = ['uRawDepth', 'uTexelSize', 'uSpatialSigma2'] as const;

/**
 * Spatial sigma² values indexed by bilateral radius.
 * Radius 2 → sigma=1.5 → sigma²=2.25 (5×5 kernel).
 * Radius 1 → sigma=0.75 → sigma²=0.5625 (3×3 kernel).
 */
const SPATIAL_SIGMA2_BY_RADIUS: Record<number, number> = {
  2: 2.25,   // 1.5²
  1: 0.5625, // 0.75²
};

function createBilateralFilterPass(
  gl: WebGL2RenderingContext,
  bilateralRadius: number
): BilateralFilterPass {
  // Inject BILATERAL_RADIUS as a compile-time #define.
  const fragSource = BILATERAL_FRAGMENT_SHADER.replace(
    '#version 300 es',
    `#version 300 es\n#define BILATERAL_RADIUS ${bilateralRadius}`
  );

  const vertShader = compileShader(gl, gl.VERTEX_SHADER, BILATERAL_VERTEX_SHADER);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, BILATERAL_UNIFORM_NAMES);

  const spatialSigma2 = SPATIAL_SIGMA2_BY_RADIUS[bilateralRadius] ?? 2.25;

  let fbo: WebGLFramebuffer | null = null;

  const pass: BilateralFilterPass = {
    name: 'bilateral-filter',
    program,
    uniforms,
    fbo: null,
    outputs: [],
    width: 0,
    height: 0,

    resize(_gl: WebGL2RenderingContext, _width: number, _height: number): void {
      // Bilateral filter uses initFBO() instead of generic resize(),
      // because its output texture is owned by the renderer (filteredDepthTexture
      // is shared with the parallax pass as input).
    },

    initFBO(
      gl: WebGL2RenderingContext,
      filteredDepthTexture: WebGLTexture,
      depthWidth: number,
      depthHeight: number
    ): void {
      // Dispose previous FBO if re-initializing.
      if (fbo) {
        gl.deleteFramebuffer(fbo);
      }

      pass.width = depthWidth;
      pass.height = depthHeight;

      fbo = gl.createFramebuffer();
      pass.fbo = fbo;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
        filteredDepthTexture, 0
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      // Set static uniforms for this pass.
      gl.useProgram(program);
      gl.uniform1i(uniforms.uRawDepth, 2);
      gl.uniform2f(uniforms.uTexelSize, 1.0 / depthWidth, 1.0 / depthHeight);
      gl.uniform1f(uniforms.uSpatialSigma2, spatialSigma2);
    },

    execute(
      gl: WebGL2RenderingContext,
      quadVao: WebGLVertexArrayObject,
      rawDepthTexture: WebGLTexture,
      depthData: Uint8Array,
      depthWidth: number,
      depthHeight: number,
      canvasWidth: number,
      canvasHeight: number
    ): void {
      if (!fbo) return;

      // 1. Upload raw depth data to the raw depth texture.
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, rawDepthTexture);
      gl.texSubImage2D(
        gl.TEXTURE_2D, 0,
        0, 0,
        depthWidth, depthHeight,
        gl.RED, gl.UNSIGNED_BYTE,
        depthData
      );

      // 2. Run bilateral filter: render into filteredDepthTexture via FBO.
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, depthWidth, depthHeight);

      gl.useProgram(program);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      // 3. Restore: unbind FBO and reset viewport to canvas size.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvasWidth, canvasHeight);
    },

    dispose(gl: WebGL2RenderingContext): void {
      if (fbo) {
        gl.deleteFramebuffer(fbo);
        fbo = null;
        pass.fbo = null;
      }
      gl.deleteProgram(program);
    },
  };

  return pass;
}

// ---------------------------------------------------------------------------
// Parallax pass factory
// ---------------------------------------------------------------------------

/** Uniform names for the parallax shader. */
const PARALLAX_UNIFORM_NAMES = [
  'uImage', 'uDepth', 'uOffset', 'uStrength',
  'uPomEnabled', 'uPomSteps',
  'uContrastLow', 'uContrastHigh', 'uVerticalReduction',
  'uDofStart', 'uDofStrength',
  'uImageTexelSize', 'uUvOffset', 'uUvScale',
] as const;

/** Compile-time upper bound for the POM for-loop in GLSL. */
const MAX_POM_STEPS = 64;

function createParallaxPass(
  gl: WebGL2RenderingContext
): ParallaxPass {
  // Inject MAX_POM_STEPS as a #define into the fragment shader.
  const fragSource = FRAGMENT_SHADER.replace(
    '#version 300 es',
    `#version 300 es\n#define MAX_POM_STEPS ${MAX_POM_STEPS}`
  );

  const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, PARALLAX_UNIFORM_NAMES);

  return {
    name: 'parallax',
    program,
    uniforms,

    setStaticUniforms(
      gl: WebGL2RenderingContext,
      config: ResolvedParallaxRendererConfig,
      videoWidth: number,
      videoHeight: number
    ): void {
      gl.useProgram(program);

      // Texture unit bindings: video=0, filtered depth=1
      gl.uniform1i(uniforms.uImage, 0);
      gl.uniform1i(uniforms.uDepth, 1);

      // Static shader parameters (set once, never updated per-frame)
      gl.uniform1f(uniforms.uStrength, config.parallaxStrength);
      gl.uniform1i(uniforms.uPomEnabled, config.pomEnabled ? 1 : 0);
      gl.uniform1i(uniforms.uPomSteps, config.pomSteps);
      gl.uniform1f(uniforms.uContrastLow, config.contrastLow);
      gl.uniform1f(uniforms.uContrastHigh, config.contrastHigh);
      gl.uniform1f(uniforms.uVerticalReduction, config.verticalReduction);
      gl.uniform1f(uniforms.uDofStart, config.dofStart);
      gl.uniform1f(uniforms.uDofStrength, config.dofStrength);
      gl.uniform2f(uniforms.uImageTexelSize, 1.0 / videoWidth, 1.0 / videoHeight);
    },

    updateUvTransform(
      gl: WebGL2RenderingContext,
      uvOffset: readonly number[],
      uvScale: readonly number[]
    ): void {
      gl.useProgram(program);
      gl.uniform2f(uniforms.uUvOffset, uvOffset[0], uvOffset[1]);
      gl.uniform2f(uniforms.uUvScale, uvScale[0], uvScale[1]);
    },

    dispose(gl: WebGL2RenderingContext): void {
      gl.deleteProgram(program);
    },
  };
}

// ---------------------------------------------------------------------------
// Renderer class
// ---------------------------------------------------------------------------

export class ParallaxRenderer extends RendererBase {
  // ---- Shared GPU resources ----
  private gl: WebGL2RenderingContext | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;

  // ---- Render passes ----
  private bilateralPass: BilateralFilterPass | null = null;
  private parallaxPass: ParallaxPass | null = null;

  // ---- Texture registry (init-time allocation, zero per-frame overhead) ----
  private readonly textures = new TextureRegistry();
  private readonly videoSlot: TextureSlot;
  private readonly filteredDepthSlot: TextureSlot;
  private readonly rawDepthSlot: TextureSlot;

  /** Resolved config with all optional shader params filled from defaults. */
  private readonly config: ResolvedParallaxRendererConfig;

  /**
   * Create the renderer and attach its canvas to the DOM.
   *
   * @param parent - The container element that the WebGL canvas is
   *   appended to. The renderer sizes itself to fill this element.
   * @param config - Parallax-specific settings (strength, POM, overscan).
   *   Optional shader parameters are merged with calibrated defaults.
   */
  constructor(
    parent: HTMLElement,
    config: ParallaxRendererConfig
  ) {
    super(parent);

    // Register texture slots at init time — cached references used in hot path.
    // Unit numbers: video=0, filteredDepth=1, rawDepth=2
    this.videoSlot = this.textures.register('video');           // unit 0
    this.filteredDepthSlot = this.textures.register('filteredDepth'); // unit 1
    this.rawDepthSlot = this.textures.register('rawDepth');     // unit 2

    // Merge explicit config with calibrated defaults for optional shader params.
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

    // Create the WebGL 2 context.
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is not supported.');
    this.gl = gl;

    // Resolve adaptive quality parameters (probes GPU if 'auto').
    this.qualityParams = resolveQuality(gl, config.quality);

    // Set sRGB drawing buffer color space for correct color output.
    if ('drawingBufferColorSpace' in gl) {
      (gl as unknown as Record<string, string>).drawingBufferColorSpace = 'srgb';
    }

    gl.clearColor(0, 0, 0, 1);

    // Both video and depth textures need Y-flip (HTML/image data is top-to-bottom,
    // WebGL textures are bottom-to-top). Set once here instead of toggling per-frame,
    // which avoids pixel storage state changes that stall mobile GPU pipelines.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initGPUResources();
    this.setupResizeHandling();
  }

  /**
   * Set up the scene: create video texture, depth textures + FBO, and
   * set static shader uniforms.
   *
   * Call this once after the media source and depth data are loaded.
   *
   * @param source - The media source to sample color frames from.
   *   Must already have dimensions available (width/height set).
   * @param depthWidth - Width of the precomputed depth map (e.g. 512).
   * @param depthHeight - Height of the precomputed depth map (e.g. 512).
   */
  initialize(source: MediaSource, depthWidth: number, depthHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeTextures();

    this.isCameraSource = source.type === 'camera';
    this.videoAspect = source.width / source.height;

    // Clamp depth dimensions to the quality tier's maximum.
    this.clampDepthDimensions(depthWidth, depthHeight, this.qualityParams.depthMaxDim);

    // --- Video texture (via TextureRegistry, unit 0) ---
    this.videoSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Raw depth texture (via TextureRegistry, unit 2) ---
    // Receives raw interpolated depth from CPU. Used as input to the
    // bilateral filter pass.
    this.rawDepthSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.rawDepthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.rawDepthSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, depthWidth, depthHeight);

    // --- Filtered depth texture (via TextureRegistry, unit 1) ---
    // Output of the bilateral filter pass. Read by the parallax shader.
    this.filteredDepthSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.filteredDepthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.filteredDepthSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, depthWidth, depthHeight);

    // --- Initialize bilateral filter pass FBO + static uniforms ---
    if (this.bilateralPass && this.filteredDepthSlot.texture) {
      this.bilateralPass.initFBO(gl, this.filteredDepthSlot.texture, depthWidth, depthHeight);
    }

    // --- Set parallax pass static uniforms ---
    if (this.parallaxPass) {
      this.parallaxPass.setStaticUniforms(gl, this.config, source.width, source.height);
    }

    // Size everything to the current viewport.
    this.recalculateViewportLayout();
  }

  // -----------------------------------------------------------------------
  // GPU resource initialization
  // -----------------------------------------------------------------------

  /**
   * Create render passes and shared fullscreen quad VAO.
   *
   * Each pass is a self-contained unit with its own program and uniform
   * cache. They share a single VAO for the fullscreen quad geometry.
   */
  private initGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    // Create render passes (each compiles its own shaders).
    // Bilateral radius is injected as a compile-time #define.
    this.bilateralPass = createBilateralFilterPass(gl, this.qualityParams.bilateralRadius);
    this.parallaxPass = createParallaxPass(gl);

    // Shared fullscreen quad VAO — used by both passes.
    // Created from the parallax program (both programs use the same
    // `aPosition` attribute, so the VAO is compatible).
    this.quadVao = createFullscreenQuadVao(gl, this.parallaxPass.program);

    // Disable depth testing — single fullscreen quad, no depth needed.
    gl.disable(gl.DEPTH_TEST);
  }

  // -----------------------------------------------------------------------
  // Abstract method implementations
  // -----------------------------------------------------------------------

  /**
   * Main render loop — called every animation frame at display refresh rate.
   *
   * When RVFC is active, this only handles:
   * 1. Uploading the current video frame to the GPU texture.
   * 2. Updating the parallax offset uniform from input (buttery smooth).
   * 3. Rendering the fullscreen quad (single draw call).
   *
   * When RVFC is NOT supported, this falls back to the original behavior:
   * depth update + input update + render all in a single RAF tick.
   */
  protected onRenderFrame(): void {
    const gl = this.gl;
    const source = this.mediaSource;
    if (!gl || !this.parallaxPass || !this.quadVao) {
      return;
    }

    const imageSource = source?.getImageSource();
    if (!imageSource) return;

    gl.useProgram(this.parallaxPass.program);

    // Upload the current video frame to the GPU.
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource);

    // Fallback: when RVFC is not supported, do depth update here.
    if (!this.rvfcSupported) {
      this.onDepthUpdate(source!.currentTime);
    }

    // Update the parallax offset from mouse/gyro input — always at RAF rate.
    // x is negated so that moving the mouse right shifts the image left,
    // revealing content from the right — matching real parallax behavior.
    if (this.readInput) {
      const input = this.readInput();
      gl.uniform2f(this.parallaxPass.uniforms.uOffset, -input.x, input.y);
    }

    // Draw the fullscreen quad (reads filtered depth from TEXTURE_UNIT 1).
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * Upload raw depth data to the GPU and run the bilateral filter pass.
   *
   * Delegates to the bilateral filter pass object, which encapsulates
   * the upload → FBO bind → draw → FBO unbind → viewport restore sequence.
   *
   * The parallax shader reads from filteredDepthTexture (UNIT 1).
   */
  protected onDepthUpdate(timeSec: number): void {
    const gl = this.gl;
    if (
      !gl || !this.readDepth ||
      !this.rawDepthSlot.texture || !this.bilateralPass
    ) return;

    const depthData = this.subsampleDepth(this.readDepth(timeSec));

    this.bilateralPass.execute(
      gl,
      this.quadVao!,
      this.rawDepthSlot.texture,
      depthData,
      this.depthWidth,
      this.depthHeight,
      this.canvas.width,
      this.canvas.height
    );
  }

  /**
   * Recalculate the WebGL canvas size and UV transform to match the
   * current container dimensions.
   *
   * Cover-fit + overscan is expressed as a UV-space transform (offset + scale)
   * rather than geometry resize. The fullscreen quad stays fixed at -1 to 1.
   */
  protected recalculateViewportLayout(): void {
    const gl = this.gl;
    if (!gl) return;

    const { width, height } = this.getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, this.qualityParams.dprCap);

    // Set the canvas drawing buffer to match the container at the device pixel ratio.
    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
      gl.viewport(0, 0, bufferWidth, bufferHeight);
    }

    // Compute cover-fit UV transform.
    this.computeCoverFitUV(this.config.parallaxStrength, this.config.overscanPadding);

    // Update the UV transform uniforms via the parallax pass.
    if (this.parallaxPass) {
      this.parallaxPass.updateUvTransform(gl, this.uvOffset, this.uvScale);
    }
  }

  /** Release all GPU resources. */
  protected disposeRenderer(): void {
    this.disposeTextures();
    this.disposeGPUResources();

    // Explicitly release the WebGL context to free GPU resources.
    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      this.gl = null;
    }
  }

  /** Rebuild GPU state after context restoration. */
  protected onContextRestored(): void {
    const gl = this.canvas.getContext('webgl2');
    if (!gl) return;
    this.gl = gl;
    gl.clearColor(0, 0, 0, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initGPUResources();

    // Re-initialize textures if we had them before.
    if (this.mediaSource && this.depthWidth > 0) {
      this.initialize(this.mediaSource, this.depthWidth, this.depthHeight);
    }

    // Restart the render loop.
    if (this.mediaSource) {
      this.animationFrameHandle = window.requestAnimationFrame(() => this.onRenderFrame());
    }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Dispose all textures via the registry (video, rawDepth, filteredDepth). */
  private disposeTextures(): void {
    const gl = this.gl;
    if (!gl) return;

    this.textures.disposeAll(gl);
  }

  /** Dispose render passes and shared VAO. */
  private disposeGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.bilateralPass) {
      this.bilateralPass.dispose(gl);
      this.bilateralPass = null;
    }

    if (this.parallaxPass) {
      this.parallaxPass.dispose(gl);
      this.parallaxPass = null;
    }

    if (this.quadVao) {
      gl.deleteVertexArray(this.quadVao);
      this.quadVao = null;
    }
  }
}
