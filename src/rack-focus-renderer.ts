/**
 * Rack Focus Renderer — GPU-accelerated depth-aware bokeh blur.
 *
 * Renders a depth-of-field effect using a 4-pass WebGL 2 pipeline:
 *
 * 1. **Bilateral filter pass** — edge-preserving depth smoothing.
 *    Reads raw depth (UNIT 3), writes filtered depth (UNIT 1) via FBO.
 *    Runs at RVFC rate (~5fps, only when depth data changes).
 *
 * 2. **CoC computation pass** — computes signed Circle of Confusion per pixel.
 *    Reads filtered depth (UNIT 1), writes CoC (UNIT 2) via FBO (R16F).
 *    Runs at RAF rate.
 *
 * 3. **DOF blur pass** — Poisson disc bokeh blur with depth-aware weighting.
 *    Reads video (UNIT 0) + CoC (UNIT 2), writes blurred (UNIT 4) via FBO.
 *    Runs at RAF rate.
 *
 * 4. **Composite pass** — blends sharp and blurred by CoC, applies vignette.
 *    Reads video (UNIT 0) + blurred (UNIT 4) + CoC (UNIT 2), renders to screen.
 *    Runs at RAF rate.
 *
 * ## Texture units
 *
 * | Unit | Name           | Format | Purpose                        |
 * |------|----------------|--------|--------------------------------|
 * | 0    | video          | RGBA8  | Current video/image frame      |
 * | 1    | filteredDepth  | R8     | Bilateral-filtered depth map   |
 * | 2    | coc            | R16F   | Signed Circle of Confusion     |
 * | 3    | rawDepth       | R8     | Raw depth (bilateral input)    |
 * | 4    | blurred        | RGBA8  | DOF-blurred color result       |
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
import type { FocusState } from './focus-input-handler';

// ---------------------------------------------------------------------------
// Shader imports (Vite ?raw)
// ---------------------------------------------------------------------------

import VERTEX_SHADER from './shaders/rack-focus/vertex.vert.glsl?raw';
import COC_FRAGMENT from './shaders/rack-focus/coc.frag.glsl?raw';
import DOF_BLUR_FRAGMENT from './shaders/rack-focus/dof-blur.frag.glsl?raw';
import COMPOSITE_FRAGMENT from './shaders/rack-focus/composite.frag.glsl?raw';
import BILATERAL_VERTEX from './shaders/parallax/bilateral.vert.glsl?raw';
import BILATERAL_FRAGMENT from './shaders/parallax/bilateral.frag.glsl?raw';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface RackFocusRendererConfig {
  aperture: number;
  maxBlurRadius: number;
  focusRange: number;
  depthScale: number;
  highlightBloom: boolean;
  highlightThreshold: number;
  highlightBoost: number;
  vignetteStrength: number;
  quality?: 'auto' | QualityTier;
}

interface ResolvedConfig {
  aperture: number;
  maxBlurRadius: number;
  focusRange: number;
  depthScale: number;
  highlightThreshold: number;
  highlightBoost: number;
  vignetteStrength: number;
}

const CONFIG_DEFAULTS = {
  aperture: 1.0,
  maxBlurRadius: 24.0,
  focusRange: 0.05,
  depthScale: 50.0,
  highlightThreshold: 0.85,
  highlightBoost: 2.0,
  vignetteStrength: 0.15,
} as const;

// ---------------------------------------------------------------------------
// Render pass types
// ---------------------------------------------------------------------------

type BilateralFilterPass = FBOPass & {
  initFBO(
    gl: WebGL2RenderingContext,
    filteredDepthTexture: WebGLTexture,
    depthWidth: number,
    depthHeight: number
  ): void;
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

type CocPass = RenderPass & {
  setStaticUniforms(gl: WebGL2RenderingContext, config: ResolvedConfig): void;
  updateUvTransform(gl: WebGL2RenderingContext, uvOffset: readonly number[], uvScale: readonly number[]): void;
  updateFocusState(gl: WebGL2RenderingContext, state: FocusState): void;
};

type DofBlurPass = RenderPass & {
  setStaticUniforms(gl: WebGL2RenderingContext, config: ResolvedConfig): void;
  updateTexelSize(gl: WebGL2RenderingContext, width: number, height: number): void;
  updateUvTransform(gl: WebGL2RenderingContext, uvOffset: readonly number[], uvScale: readonly number[]): void;
};

type CompositePass = RenderPass & {
  setStaticUniforms(gl: WebGL2RenderingContext, config: ResolvedConfig): void;
  updateUvTransform(gl: WebGL2RenderingContext, uvOffset: readonly number[], uvScale: readonly number[]): void;
};

// ---------------------------------------------------------------------------
// Bilateral filter pass factory (reuses parallax shader source)
// ---------------------------------------------------------------------------

const BILATERAL_UNIFORM_NAMES = ['uRawDepth', 'uTexelSize', 'uSpatialSigma2'] as const;

const SPATIAL_SIGMA2_BY_RADIUS: Record<number, number> = {
  2: 2.25,
  1: 0.5625,
};

function createBilateralFilterPass(
  gl: WebGL2RenderingContext,
  bilateralRadius: number
): BilateralFilterPass {
  const fragSource = BILATERAL_FRAGMENT.replace(
    '#version 300 es',
    `#version 300 es\n#define BILATERAL_RADIUS ${bilateralRadius}`
  );

  const vertShader = compileShader(gl, gl.VERTEX_SHADER, BILATERAL_VERTEX);
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

    resize(): void { /* Uses initFBO instead */ },

    initFBO(gl, filteredDepthTexture, depthWidth, depthHeight): void {
      if (fbo) gl.deleteFramebuffer(fbo);

      pass.width = depthWidth;
      pass.height = depthHeight;

      fbo = gl.createFramebuffer();
      pass.fbo = fbo;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, filteredDepthTexture, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);

      gl.useProgram(program);
      gl.uniform1i(uniforms.uRawDepth, 3); // rawDepth on UNIT 3
      gl.uniform2f(uniforms.uTexelSize, 1.0 / depthWidth, 1.0 / depthHeight);
      gl.uniform1f(uniforms.uSpatialSigma2, spatialSigma2);
    },

    execute(gl, quadVao, rawDepthTexture, depthData, depthWidth, depthHeight, canvasWidth, canvasHeight): void {
      if (!fbo) return;

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, rawDepthTexture);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, depthWidth, depthHeight, gl.RED, gl.UNSIGNED_BYTE, depthData);

      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, depthWidth, depthHeight);

      gl.useProgram(program);
      gl.bindVertexArray(quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvasWidth, canvasHeight);
    },

    dispose(gl): void {
      if (fbo) { gl.deleteFramebuffer(fbo); fbo = null; pass.fbo = null; }
      gl.deleteProgram(program);
    },
  };

  return pass;
}

// ---------------------------------------------------------------------------
// CoC pass factory
// ---------------------------------------------------------------------------

const COC_UNIFORM_NAMES = [
  'uDepth', 'uFocalDepth', 'uAperture', 'uFocusRange',
  'uDepthScale', 'uMaxBlurRadius', 'uBreathScale', 'uBreathOffset',
  'uUvOffset', 'uUvScale',
] as const;

function createCocPass(gl: WebGL2RenderingContext): CocPass {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, COC_FRAGMENT);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, COC_UNIFORM_NAMES);

  return {
    name: 'coc-computation',
    program,
    uniforms,

    setStaticUniforms(gl, config): void {
      gl.useProgram(program);
      gl.uniform1i(uniforms.uDepth, 1); // filteredDepth on UNIT 1
      gl.uniform1f(uniforms.uAperture, config.aperture);
      gl.uniform1f(uniforms.uFocusRange, config.focusRange);
      gl.uniform1f(uniforms.uDepthScale, config.depthScale);
      gl.uniform1f(uniforms.uMaxBlurRadius, config.maxBlurRadius);
    },

    updateUvTransform(gl, uvOffset, uvScale): void {
      gl.useProgram(program);
      gl.uniform2f(uniforms.uUvOffset, uvOffset[0], uvOffset[1]);
      gl.uniform2f(uniforms.uUvScale, uvScale[0], uvScale[1]);
    },

    updateFocusState(gl, state): void {
      gl.useProgram(program);
      gl.uniform1f(uniforms.uFocalDepth, state.focalDepth);
      gl.uniform1f(uniforms.uBreathScale, state.breathScale);
      gl.uniform2f(uniforms.uBreathOffset, state.breathOffset[0], state.breathOffset[1]);
    },

    dispose(gl): void { gl.deleteProgram(program); },
  };
}

// ---------------------------------------------------------------------------
// DOF blur pass factory
// ---------------------------------------------------------------------------

const DOF_BLUR_UNIFORM_NAMES = [
  'uImage', 'uCoc', 'uMaxBlurRadius', 'uImageTexelSize',
  'uHighlightThreshold', 'uHighlightBoost',
  'uUvOffset', 'uUvScale',
] as const;

function createDofBlurPass(
  gl: WebGL2RenderingContext,
  poissonSamples: number
): DofBlurPass {
  const fragSource = DOF_BLUR_FRAGMENT.replace(
    '#version 300 es',
    `#version 300 es\n#define POISSON_SAMPLES ${poissonSamples}`
  );

  const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, DOF_BLUR_UNIFORM_NAMES);

  return {
    name: 'dof-blur',
    program,
    uniforms,

    setStaticUniforms(gl, config): void {
      gl.useProgram(program);
      gl.uniform1i(uniforms.uImage, 0); // video on UNIT 0
      gl.uniform1i(uniforms.uCoc, 2);   // CoC on UNIT 2
      gl.uniform1f(uniforms.uMaxBlurRadius, config.maxBlurRadius);
      gl.uniform1f(uniforms.uHighlightThreshold, config.highlightThreshold);
      gl.uniform1f(uniforms.uHighlightBoost, config.highlightBoost);
    },

    updateTexelSize(gl, width, height): void {
      gl.useProgram(program);
      gl.uniform2f(uniforms.uImageTexelSize, 1.0 / width, 1.0 / height);
    },

    updateUvTransform(gl, uvOffset, uvScale): void {
      gl.useProgram(program);
      gl.uniform2f(uniforms.uUvOffset, uvOffset[0], uvOffset[1]);
      gl.uniform2f(uniforms.uUvScale, uvScale[0], uvScale[1]);
    },

    dispose(gl): void { gl.deleteProgram(program); },
  };
}

// ---------------------------------------------------------------------------
// Composite pass factory
// ---------------------------------------------------------------------------

const COMPOSITE_UNIFORM_NAMES = [
  'uImage', 'uBlurred', 'uCoc', 'uVignetteStrength',
  'uUvOffset', 'uUvScale',
] as const;

function createCompositePass(gl: WebGL2RenderingContext): CompositePass {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, COMPOSITE_FRAGMENT);
  const program = linkProgram(gl, vertShader, fragShader);
  const uniforms = getUniformLocations(gl, program, COMPOSITE_UNIFORM_NAMES);

  return {
    name: 'composite',
    program,
    uniforms,

    setStaticUniforms(gl, config): void {
      gl.useProgram(program);
      gl.uniform1i(uniforms.uImage, 0);   // video on UNIT 0
      gl.uniform1i(uniforms.uBlurred, 4); // blurred on UNIT 4
      gl.uniform1i(uniforms.uCoc, 2);     // CoC on UNIT 2
      gl.uniform1f(uniforms.uVignetteStrength, config.vignetteStrength);
    },

    updateUvTransform(gl, uvOffset, uvScale): void {
      gl.useProgram(program);
      gl.uniform2f(uniforms.uUvOffset, uvOffset[0], uvOffset[1]);
      gl.uniform2f(uniforms.uUvScale, uvScale[0], uvScale[1]);
    },

    dispose(gl): void { gl.deleteProgram(program); },
  };
}

// ---------------------------------------------------------------------------
// Renderer class
// ---------------------------------------------------------------------------

export class RackFocusRenderer extends RendererBase {
  private gl: WebGL2RenderingContext | null = null;
  private quadVao: WebGLVertexArrayObject | null = null;

  // Render passes
  private bilateralPass: BilateralFilterPass | null = null;
  private cocPass: CocPass | null = null;
  private dofBlurPass: DofBlurPass | null = null;
  private compositePass: CompositePass | null = null;

  // FBOs for CoC and blur
  private cocFbo: WebGLFramebuffer | null = null;
  private blurFbo: WebGLFramebuffer | null = null;

  // Texture registry
  private readonly textures = new TextureRegistry();
  private readonly videoSlot: TextureSlot;
  private readonly filteredDepthSlot: TextureSlot;
  private readonly cocSlot: TextureSlot;
  private readonly rawDepthSlot: TextureSlot;
  private readonly blurredSlot: TextureSlot;

  private readonly config: ResolvedConfig;

  // Focus state callback (replaces readInput for rack focus)
  private readFocusState: (() => FocusState) | null = null;

  // DOF buffer dimensions (may be half-res on low tier)
  private dofWidth = 0;
  private dofHeight = 0;
  private readonly dofDivisor: number;

  constructor(parent: HTMLElement, config: RackFocusRendererConfig) {
    super(parent);

    // Register texture slots.
    this.videoSlot = this.textures.register('video');               // unit 0
    this.filteredDepthSlot = this.textures.register('filteredDepth'); // unit 1
    this.cocSlot = this.textures.register('coc');                   // unit 2
    this.rawDepthSlot = this.textures.register('rawDepth');         // unit 3
    this.blurredSlot = this.textures.register('blurred');           // unit 4

    this.config = {
      aperture: config.aperture ?? CONFIG_DEFAULTS.aperture,
      maxBlurRadius: config.maxBlurRadius ?? CONFIG_DEFAULTS.maxBlurRadius,
      focusRange: config.focusRange ?? CONFIG_DEFAULTS.focusRange,
      depthScale: config.depthScale ?? CONFIG_DEFAULTS.depthScale,
      highlightThreshold: config.highlightThreshold ?? CONFIG_DEFAULTS.highlightThreshold,
      highlightBoost: config.highlightBloom ? (config.highlightBoost ?? CONFIG_DEFAULTS.highlightBoost) : 1.0,
      vignetteStrength: config.vignetteStrength ?? CONFIG_DEFAULTS.vignetteStrength,
    };

    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is not supported.');
    this.gl = gl;

    this.qualityParams = resolveQuality(gl, config.quality);
    this.dofDivisor = this.qualityParams.tier === 'low' ? 2 : 1;

    if ('drawingBufferColorSpace' in gl) {
      (gl as unknown as Record<string, string>).drawingBufferColorSpace = 'srgb';
    }

    gl.clearColor(0, 0, 0, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initGPUResources();
    this.setupResizeHandling();
  }

  initialize(source: MediaSource, depthWidth: number, depthHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeTextures();

    this.isCameraSource = source.type === 'camera';
    this.videoAspect = source.width / source.height;
    this.clampDepthDimensions(depthWidth, depthHeight, this.qualityParams.depthMaxDim);

    // --- Video texture (UNIT 0) ---
    this.videoSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Raw depth texture (UNIT 3) ---
    this.rawDepthSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.rawDepthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.rawDepthSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, this.depthWidth, this.depthHeight);

    // --- Filtered depth texture (UNIT 1) ---
    this.filteredDepthSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.filteredDepthSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.filteredDepthSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, this.depthWidth, this.depthHeight);

    // --- Initialize bilateral filter FBO ---
    if (this.bilateralPass && this.filteredDepthSlot.texture) {
      this.bilateralPass.initFBO(gl, this.filteredDepthSlot.texture, this.depthWidth, this.depthHeight);
    }

    // --- Set static uniforms on all passes ---
    this.cocPass?.setStaticUniforms(gl, this.config);
    this.dofBlurPass?.setStaticUniforms(gl, this.config);
    this.compositePass?.setStaticUniforms(gl, this.config);

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
  // GPU resource initialization
  // -----------------------------------------------------------------------

  private initGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    const poissonSamples = this.qualityParams.tier === 'high' ? 48
      : this.qualityParams.tier === 'medium' ? 32 : 16;

    this.bilateralPass = createBilateralFilterPass(gl, this.qualityParams.bilateralRadius);
    this.cocPass = createCocPass(gl);
    this.dofBlurPass = createDofBlurPass(gl, poissonSamples);
    this.compositePass = createCompositePass(gl);

    this.quadVao = createFullscreenQuadVao(gl, this.cocPass.program);

    gl.disable(gl.DEPTH_TEST);
  }

  // -----------------------------------------------------------------------
  // Abstract method implementations
  // -----------------------------------------------------------------------

  protected onRenderFrame(): void {
    const gl = this.gl;
    const source = this.mediaSource;
    if (!gl || !this.cocPass || !this.dofBlurPass || !this.compositePass || !this.quadVao) return;

    const imageSource = source?.getImageSource();
    if (!imageSource) return;

    // Upload video frame.
    gl.activeTexture(gl.TEXTURE0 + this.videoSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.videoSlot.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageSource);

    // Fallback depth update when RVFC not supported.
    if (!this.rvfcSupported) {
      this.onDepthUpdate(source!.currentTime);
    }

    // Read focus state and update CoC uniforms.
    if (this.readFocusState) {
      const state = this.readFocusState();
      this.cocPass.updateFocusState(gl, state);
    }

    // --- Pass 2: CoC computation → cocFBO ---
    if (this.cocFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.cocFbo);
      gl.viewport(0, 0, this.dofWidth, this.dofHeight);

      gl.useProgram(this.cocPass.program);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // --- Pass 3: DOF blur → blurFBO ---
    if (this.blurFbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo);
      // viewport already set to dofWidth x dofHeight

      gl.useProgram(this.dofBlurPass.program);
      gl.bindVertexArray(this.quadVao);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // --- Pass 4: Composite → screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

    gl.useProgram(this.compositePass.program);
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  protected onDepthUpdate(timeSec: number): void {
    const gl = this.gl;
    if (!gl || !this.readDepth || !this.rawDepthSlot.texture || !this.bilateralPass) return;

    const depthData = this.subsampleDepth(this.readDepth(timeSec));

    this.bilateralPass.execute(
      gl, this.quadVao!, this.rawDepthSlot.texture,
      depthData, this.depthWidth, this.depthHeight,
      this.canvas.width, this.canvas.height
    );
  }

  protected recalculateViewportLayout(): void {
    const gl = this.gl;
    if (!gl) return;

    const { width, height } = this.getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, this.qualityParams.dprCap);

    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
      gl.viewport(0, 0, bufferWidth, bufferHeight);
    }

    // DOF buffer resolution (may be half on low tier).
    this.dofWidth = Math.max(1, Math.floor(bufferWidth / this.dofDivisor));
    this.dofHeight = Math.max(1, Math.floor(bufferHeight / this.dofDivisor));

    // Recreate CoC and blur FBOs at the new DOF resolution.
    this.recreateDofFBOs();

    // Compute cover-fit UV transform (no overscan needed for rack focus).
    this.computeCoverFitUV(0, 0);

    // Update UV transform on passes that need it.
    this.cocPass?.updateUvTransform(gl, this.uvOffset, this.uvScale);
    this.dofBlurPass?.updateUvTransform(gl, this.uvOffset, this.uvScale);
    this.compositePass?.updateUvTransform(gl, this.uvOffset, this.uvScale);

    // Update DOF blur texel size.
    this.dofBlurPass?.updateTexelSize(gl, this.dofWidth, this.dofHeight);
  }

  protected disposeRenderer(): void {
    this.disposeTextures();
    this.disposeDofFBOs();
    this.disposeGPUResources();

    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      this.gl = null;
    }
  }

  protected onContextRestored(): void {
    const gl = this.canvas.getContext('webgl2');
    if (!gl) return;
    this.gl = gl;
    gl.clearColor(0, 0, 0, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initGPUResources();

    if (this.mediaSource && this.depthWidth > 0) {
      this.initialize(this.mediaSource, this.depthWidth, this.depthHeight);
    }

    if (this.mediaSource) {
      this.animationFrameHandle = window.requestAnimationFrame(() => this.onRenderFrame());
    }
  }

  // -----------------------------------------------------------------------
  // DOF FBO management
  // -----------------------------------------------------------------------

  private recreateDofFBOs(): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeDofFBOs();

    // --- CoC texture (UNIT 2, R16F) ---
    this.cocSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.cocSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.cocSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Try R16F first, fall back to RG8 if unsupported.
    gl.getExtension('EXT_color_buffer_float');
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, this.dofWidth, this.dofHeight, 0, gl.RED, gl.HALF_FLOAT, null);

    this.cocFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cocFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.cocSlot.texture, 0);

    const cocStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    if (cocStatus !== gl.FRAMEBUFFER_COMPLETE) {
      // Fallback to RG8 encoding for CoC.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, this.dofWidth, this.dofHeight, 0, gl.RG, gl.UNSIGNED_BYTE, null);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.cocSlot.texture, 0);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // --- Blurred texture (UNIT 4, RGBA8) ---
    this.blurredSlot.texture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + this.blurredSlot.unit);
    gl.bindTexture(gl.TEXTURE_2D, this.blurredSlot.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.dofWidth, this.dofHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    this.blurFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.blurFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.blurredSlot.texture, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  private disposeDofFBOs(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.cocFbo) { gl.deleteFramebuffer(this.cocFbo); this.cocFbo = null; }
    if (this.blurFbo) { gl.deleteFramebuffer(this.blurFbo); this.blurFbo = null; }
    if (this.cocSlot.texture) { gl.deleteTexture(this.cocSlot.texture); (this.cocSlot as { texture: WebGLTexture | null }).texture = null; }
    if (this.blurredSlot.texture) { gl.deleteTexture(this.blurredSlot.texture); (this.blurredSlot as { texture: WebGLTexture | null }).texture = null; }
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  private disposeTextures(): void {
    const gl = this.gl;
    if (!gl) return;
    // Only dispose video, rawDepth, filteredDepth — CoC and blurred are in DOF FBOs.
    if (this.videoSlot.texture) { gl.deleteTexture(this.videoSlot.texture); (this.videoSlot as { texture: WebGLTexture | null }).texture = null; }
    if (this.rawDepthSlot.texture) { gl.deleteTexture(this.rawDepthSlot.texture); (this.rawDepthSlot as { texture: WebGLTexture | null }).texture = null; }
    if (this.filteredDepthSlot.texture) { gl.deleteTexture(this.filteredDepthSlot.texture); (this.filteredDepthSlot as { texture: WebGLTexture | null }).texture = null; }
  }

  private disposeGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    this.bilateralPass?.dispose(gl); this.bilateralPass = null;
    this.cocPass?.dispose(gl); this.cocPass = null;
    this.dofBlurPass?.dispose(gl); this.dofBlurPass = null;
    this.compositePass?.dispose(gl); this.compositePass = null;

    if (this.quadVao) { gl.deleteVertexArray(this.quadVao); this.quadVao = null; }
  }
}
