/**
 * Parallax Renderer — GPU-accelerated depth-aware video parallax.
 *
 * Renders a single fullscreen quad textured with the source video
 * and a precomputed depth map using pure WebGL 2. A custom fragment
 * shader displaces UV coordinates per-pixel based on the depth value
 * and current mouse/gyro input, creating a continuous parallax effect
 * with no discrete layer banding.
 *
 * ## Rendering pipeline (per frame)
 *
 * 1. The video element's current frame is uploaded to the GPU via
 *    `gl.texImage2D`, providing the color frame at native resolution.
 *
 * 2. The depth interpolator produces a raw Uint8Array for the current
 *    playback time (interpolated between precomputed 5fps keyframes).
 *    This is uploaded to a single-channel R8 "raw depth" texture.
 *
 * 3. A bilateral filter shader pass runs on the raw depth texture,
 *    rendering edge-preserving smoothed depth into a second R8 texture
 *    via a framebuffer. This runs only when depth data changes (~5fps),
 *    not on every display frame.
 *
 * 4. The InputHandler provides a smoothed {x, y} offset in [-1, 1].
 *    This is passed to the shader as the uOffset uniform.
 *
 * 5. The parallax fragment shader samples the filtered depth map at
 *    each pixel's UV, computes a UV displacement proportional to
 *    (1 - depth) * strength, and samples the video texture at the
 *    displaced coordinates.
 *
 * 6. When POM is enabled, the shader ray-marches through the depth
 *    field to find the correct surface intersection, producing
 *    self-occlusion (near objects cover far objects behind them).
 *
 * ## Texture memory
 *
 * 3 textures total: 1 video (RGBA), 1 raw depth (R8), 1 filtered depth (R8).
 * The raw depth texture is uploaded from CPU when depth changes (~5fps).
 * The filtered depth texture is rendered via FBO bilateral filter pass.
 */

import type { ParallaxInput } from './input-handler';

// ---------------------------------------------------------------------------
// GLSL Shaders (GLSL 300 es for WebGL 2)
// ---------------------------------------------------------------------------

/**
 * Vertex shader — trivial pass-through for fullscreen quad.
 *
 * Used by both the bilateral filter pass and the parallax pass.
 * Maps clip-space [-1,1] to UV [0,1]. The parallax pass applies
 * cover-fit transform via uniforms; the filter pass uses identity.
 */
const VERTEX_SHADER = /* glsl */ `#version 300 es
  in vec2 aPosition;

  // UV coordinates for cover-fit + overscan.
  // Computed on the CPU and passed as a uniform to avoid
  // recreating geometry on every resize.
  uniform vec2 uUvOffset;
  uniform vec2 uUvScale;

  out vec2 vUv;
  out vec2 vScreenUv;

  void main() {
    // Map from clip space [-1,1] to [0,1], then apply cover-fit transform
    vec2 baseUv = aPosition * 0.5 + 0.5;
    vUv = baseUv * uUvScale + uUvOffset;
    // Screen-space UV always [0,1] — used for vignette and edge fade
    // which should operate on screen position, not texture coordinates.
    vScreenUv = baseUv;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

/**
 * Simple vertex shader for the bilateral filter pass.
 *
 * No cover-fit transform — the filter operates in raw depth texture space.
 * Maps clip-space [-1,1] directly to UV [0,1].
 */
const BILATERAL_VERTEX_SHADER = /* glsl */ `#version 300 es
  in vec2 aPosition;
  out vec2 vUv;

  void main() {
    vUv = aPosition * 0.5 + 0.5;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }
`;

/**
 * Bilateral filter fragment shader — edge-preserving depth smoothing.
 *
 * Weights each neighbor by both spatial distance and depth similarity
 * to the center pixel. Sharp depth boundaries (e.g., a silhouette
 * against the sky) are preserved because dissimilar-depth neighbors
 * receive near-zero weight. Smooth regions still get denoised.
 *
 * Parameters match the original CPU-side filter exactly:
 * - Spatial sigma = 1.5 texels (Gaussian falloff with distance)
 * - Depth sigma = 0.1 (normalized 0-1, controls edge sensitivity)
 * - 5×5 kernel (±2 pixels in each direction)
 *
 * Runs once per depth frame change (~5fps via FBO), not per display frame.
 */
const BILATERAL_FRAGMENT_SHADER = /* glsl */ `#version 300 es
  precision highp float;

  uniform sampler2D uRawDepth;
  uniform vec2 uTexelSize;

  in vec2 vUv;
  out vec4 fragColor;

  void main() {
    const float spatialSigma2 = 2.25;  // 1.5^2
    const float depthSigma2 = 0.01;    // 0.1^2

    float center = texture(uRawDepth, vUv).r;
    float totalWeight = 1.0;
    float totalDepth = center;

    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        if (dx == 0 && dy == 0) continue;

        vec2 offset = vec2(float(dx), float(dy)) * uTexelSize;
        float neighbor = texture(uRawDepth, vUv + offset).r;

        float spatialDist2 = float(dx * dx + dy * dy);
        float depthDiff = neighbor - center;
        float w = exp(-spatialDist2 / spatialSigma2 - (depthDiff * depthDiff) / depthSigma2);

        totalWeight += w;
        totalDepth += neighbor * w;
      }
    }

    fragColor = vec4(totalDepth / totalWeight, 0.0, 0.0, 1.0);
  }
`;

/**
 * Fragment shader — per-pixel depth-based parallax displacement.
 *
 * Two modes are available, controlled by the uPomEnabled uniform:
 *
 * ### Basic displacement (uPomEnabled = false)
 *
 * For each fragment, the shader reads the depth value at the current
 * UV, inverts it (so near = high displacement, far = low), multiplies
 * by the parallax strength and input offset, then samples the video
 * texture at the displaced UV. This is fast (2 texture lookups) but
 * does not handle occlusion — foreground objects won't cover
 * background when the viewpoint shifts.
 *
 * ### Parallax Occlusion Mapping (uPomEnabled = true)
 *
 * A ray is marched through the depth field starting at the fragment's
 * UV. At each step, the shader advances along the input offset
 * direction and compares the accumulated "layer depth" against the
 * actual depth from the map. When the ray crosses below the depth
 * surface, it has found the intersection — the shader then
 * interpolates between the last two samples for a smooth result.
 *
 * This correctly handles self-occlusion: when the viewpoint shifts,
 * near objects occlude far objects behind them. The cost is
 * uPomSteps texture lookups per fragment (typically 16-32).
 *
 * ### Depth convention
 *
 * Depth Anything v2 produces: 0 = near, 1 = far (after normalization).
 * For parallax, we invert this so near pixels get maximum displacement.
 */
const FRAGMENT_SHADER = /* glsl */ `#version 300 es
  precision highp float;

  // ---- Uniforms ----

  /** Color video frame, uploaded from HTMLVideoElement. */
  uniform sampler2D uImage;

  /**
   * Single-channel depth map (R channel, 0=near, 1=far).
   * Bilateral-filtered on the GPU via a dedicated render pass,
   * so a single texture() read gives smooth, edge-preserving depth.
   */
  uniform sampler2D uDepth;

  /**
   * Current parallax input from mouse or gyroscope.
   * Range [-1, 1] for both x (horizontal) and y (vertical).
   */
  uniform vec2 uOffset;

  /** Parallax displacement magnitude in UV space (e.g. 0.05 = 5%). */
  uniform float uStrength;

  /** Whether to use POM ray-marching instead of basic displacement. */
  uniform bool uPomEnabled;

  /** Number of ray-march steps for POM (runtime-adjustable). */
  uniform int uPomSteps;

  /** Smoothstep lower bound for depth contrast curve (depth-adaptive). */
  uniform float uContrastLow;

  /** Smoothstep upper bound for depth contrast curve (depth-adaptive). */
  uniform float uContrastHigh;

  /** Y-axis displacement multiplier (depth-adaptive). */
  uniform float uVerticalReduction;

  /** Depth threshold where DOF blur ramp begins (depth-adaptive). */
  uniform float uDofStart;

  /** Maximum DOF blur blend factor (depth-adaptive). */
  uniform float uDofStrength;

  /**
   * Texel size for video/image texture (1.0 / videoResolution).
   * Used by the depth-of-field effect to sample neighboring pixels.
   */
  uniform vec2 uImageTexelSize;

  // ---- Varyings ----

  /** Interpolated texture coordinates from vertex shader (cover-fit transformed). */
  in vec2 vUv;

  /** Screen-space UV [0,1] — always covers the full viewport. */
  in vec2 vScreenUv;

  /** Fragment output color. */
  out vec4 fragColor;

  // ---- Helper functions ----

  /**
   * Compute an edge fade factor that reduces displacement near UV
   * boundaries.
   */
  float edgeFade(vec2 uv) {
    float margin = uStrength * 1.5;
    float fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
    float fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
    return fadeX * fadeY;
  }

  /**
   * Compute a subtle vignette darkening factor.
   */
  float vignette(vec2 uv) {
    float dist = length(uv - 0.5) * 1.4;
    return 1.0 - pow(dist, 2.5);
  }

  // ---- Displacement functions ----

  /**
   * Basic UV displacement with edge fade.
   */
  vec2 basicDisplace(vec2 uv) {
    float depth = texture(uDepth, uv).r;
    depth = smoothstep(uContrastLow, uContrastHigh, depth);
    float displacement = (1.0 - depth) * uStrength;
    displacement *= edgeFade(uv);
    vec2 offset = uOffset * displacement;
    offset.y *= uVerticalReduction;
    return uv + offset;
  }

  /**
   * Parallax Occlusion Mapping (POM) ray-marching displacement.
   */
  vec2 pomDisplace(vec2 uv) {
    float layerDepth = 1.0 / float(uPomSteps);

    vec2 scaledOffset = uOffset;
    scaledOffset.y *= uVerticalReduction;

    vec2 deltaUV = scaledOffset * uStrength / float(uPomSteps);

    float currentLayerDepth = 0.0;
    vec2 currentUV = uv;

    float fade = edgeFade(uv);

    for (int i = 0; i < MAX_POM_STEPS; i++) {
      if (i >= uPomSteps) break;

      float rawDepth = texture(uDepth, currentUV).r;
      rawDepth = smoothstep(uContrastLow, uContrastHigh, rawDepth);
      float depthAtUV = 1.0 - rawDepth;

      if (currentLayerDepth > depthAtUV) {
        vec2 prevUV = currentUV - deltaUV;
        float prevLayerDepth = currentLayerDepth - layerDepth;
        float prevRaw = texture(uDepth, prevUV).r;
        prevRaw = smoothstep(uContrastLow, uContrastHigh, prevRaw);
        float prevDepthAtUV = 1.0 - prevRaw;

        float afterDepth = depthAtUV - currentLayerDepth;
        float beforeDepth = prevDepthAtUV - prevLayerDepth;
        float t = afterDepth / (afterDepth - beforeDepth);

        vec2 hitUV = mix(currentUV, prevUV, t);
        return mix(uv, hitUV, fade);
      }

      currentUV += deltaUV;
      currentLayerDepth += layerDepth;
    }

    return mix(uv, currentUV, fade);
  }

  // ---- Main ----

  void main() {
    vec2 displaced = uPomEnabled ? pomDisplace(vUv) : basicDisplace(vUv);
    displaced = clamp(displaced, vec2(0.0), vec2(1.0));

    vec4 color = texture(uImage, displaced);

    // Depth-of-field hint
    float dofDepth = texture(uDepth, displaced).r;
    float dof = smoothstep(uDofStart, 1.0, dofDepth) * uDofStrength;
    vec4 blurred = (
      texture(uImage, displaced + vec2( uImageTexelSize.x,  0.0)) +
      texture(uImage, displaced + vec2(-uImageTexelSize.x,  0.0)) +
      texture(uImage, displaced + vec2( 0.0,  uImageTexelSize.y)) +
      texture(uImage, displaced + vec2( 0.0, -uImageTexelSize.y))
    ) * 0.25;
    color = mix(color, blurred, dof);

    // Vignette (screen-space, not texture-space)
    color.rgb *= vignette(vScreenUv);

    fragColor = color;
  }
`;

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
// WebGL helpers
// ---------------------------------------------------------------------------

/** Compile a GLSL shader, throwing on error. */
function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Failed to create shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    gl.deleteShader(shader);
    throw new Error(`Shader compilation failed:\n${log}`);
  }
  return shader;
}

/** Link a shader program, throwing on error. */
function linkProgram(
  gl: WebGL2RenderingContext,
  vertShader: WebGLShader,
  fragShader: WebGLShader
): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error('Failed to create program.');
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? '';
    gl.deleteProgram(program);
    throw new Error(`Program linking failed:\n${log}`);
  }
  // Shaders can be detached after linking — the program retains the compiled code.
  gl.detachShader(program, vertShader);
  gl.detachShader(program, fragShader);
  gl.deleteShader(vertShader);
  gl.deleteShader(fragShader);
  return program;
}

/**
 * Uniform location cache for the parallax shader program.
 * Avoids repeated `getUniformLocation` calls per frame.
 */
interface UniformLocations {
  uImage: WebGLUniformLocation | null;
  uDepth: WebGLUniformLocation | null;
  uOffset: WebGLUniformLocation | null;
  uStrength: WebGLUniformLocation | null;
  uPomEnabled: WebGLUniformLocation | null;
  uPomSteps: WebGLUniformLocation | null;
  uContrastLow: WebGLUniformLocation | null;
  uContrastHigh: WebGLUniformLocation | null;
  uVerticalReduction: WebGLUniformLocation | null;
  uDofStart: WebGLUniformLocation | null;
  uDofStrength: WebGLUniformLocation | null;
  uImageTexelSize: WebGLUniformLocation | null;
  uUvOffset: WebGLUniformLocation | null;
  uUvScale: WebGLUniformLocation | null;
}

function getUniformLocations(gl: WebGL2RenderingContext, program: WebGLProgram): UniformLocations {
  return {
    uImage: gl.getUniformLocation(program, 'uImage'),
    uDepth: gl.getUniformLocation(program, 'uDepth'),
    uOffset: gl.getUniformLocation(program, 'uOffset'),
    uStrength: gl.getUniformLocation(program, 'uStrength'),
    uPomEnabled: gl.getUniformLocation(program, 'uPomEnabled'),
    uPomSteps: gl.getUniformLocation(program, 'uPomSteps'),
    uContrastLow: gl.getUniformLocation(program, 'uContrastLow'),
    uContrastHigh: gl.getUniformLocation(program, 'uContrastHigh'),
    uVerticalReduction: gl.getUniformLocation(program, 'uVerticalReduction'),
    uDofStart: gl.getUniformLocation(program, 'uDofStart'),
    uDofStrength: gl.getUniformLocation(program, 'uDofStrength'),
    uImageTexelSize: gl.getUniformLocation(program, 'uImageTexelSize'),
    uUvOffset: gl.getUniformLocation(program, 'uUvOffset'),
    uUvScale: gl.getUniformLocation(program, 'uUvScale'),
  };
}

/** Uniform location cache for the bilateral filter shader program. */
interface BilateralUniformLocations {
  uRawDepth: WebGLUniformLocation | null;
  uTexelSize: WebGLUniformLocation | null;
}

function getBilateralUniformLocations(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): BilateralUniformLocations {
  return {
    uRawDepth: gl.getUniformLocation(program, 'uRawDepth'),
    uTexelSize: gl.getUniformLocation(program, 'uTexelSize'),
  };
}

// ---------------------------------------------------------------------------
// Renderer class
// ---------------------------------------------------------------------------

export class ParallaxRenderer {
  /** Debounce delay for resize events to avoid layout thrashing. */
  private static readonly RESIZE_DEBOUNCE_MS = 100;

  /** Compile-time upper bound for the POM for-loop in GLSL. */
  private static readonly MAX_POM_STEPS = 64;

  // ---- WebGL objects (parallax pass) ----
  private readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private uniforms: UniformLocations | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private videoTexture: WebGLTexture | null = null;
  private readonly container: HTMLElement;

  // ---- WebGL objects (bilateral filter pass) ----
  private bilateralProgram: WebGLProgram | null = null;
  private bilateralUniforms: BilateralUniformLocations | null = null;
  private bilateralVao: WebGLVertexArrayObject | null = null;
  private rawDepthTexture: WebGLTexture | null = null;
  private filteredDepthTexture: WebGLTexture | null = null;
  private depthFbo: WebGLFramebuffer | null = null;

  // ---- Depth data dimensions ----
  private depthWidth = 0;
  private depthHeight = 0;

  // ---- Video dimensions (for cover-fit calculation) ----
  private videoAspect = 16 / 9;

  // ---- Callbacks ----
  private readDepth: ((timeSec: number) => Uint8Array) | null = null;
  private readInput: (() => ParallaxInput) | null = null;
  private playbackVideo: HTMLVideoElement | null = null;

  /**
   * Optional callback invoked on each new video frame (from RVFC).
   * The Web Component uses this to dispatch the 'layershift-parallax:frame' event.
   */
  private onVideoFrame: ((currentTime: number, frameNumber: number) => void) | null = null;

  // ---- Animation & resize ----
  private animationFrameHandle = 0;

  /** requestVideoFrameCallback handle (0 = inactive). */
  private rvfcHandle = 0;

  /** Whether RVFC is supported on the current video element. */
  private rvfcSupported = false;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;

  // ---- UV transform for cover-fit + overscan ----
  private uvOffset = [0, 0];
  private uvScale = [1, 1];

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
    this.container = parent;

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

    // Create the canvas and WebGL 2 context.
    this.canvas = document.createElement('canvas');
    const gl = this.canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      desynchronized: true,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL 2 is not supported.');
    this.gl = gl;

    // Set sRGB drawing buffer color space for correct color output.
    if ('drawingBufferColorSpace' in gl) {
      (gl as unknown as Record<string, string>).drawingBufferColorSpace = 'srgb';
    }

    gl.clearColor(0, 0, 0, 1);

    // Both video and depth textures need Y-flip (HTML/image data is top-to-bottom,
    // WebGL textures are bottom-to-top). Set once here instead of toggling per-frame,
    // which avoids pixel storage state changes that stall mobile GPU pipelines.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.container.appendChild(this.canvas);
    this.initGPUResources();
    this.setupResizeHandling();

    // Handle context loss and restoration.
    this.canvas.addEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.handleContextRestored);
  }

  /**
   * Set up the scene: create video texture, depth textures + FBO, and
   * set static shader uniforms.
   *
   * Call this once after the video element and depth data are loaded.
   *
   * @param video - The <video> element to sample color frames from.
   *   Must already have metadata loaded (videoWidth/videoHeight set).
   * @param depthWidth - Width of the precomputed depth map (e.g. 512).
   * @param depthHeight - Height of the precomputed depth map (e.g. 512).
   */
  initialize(video: HTMLVideoElement, depthWidth: number, depthHeight: number): void {
    const gl = this.gl;
    if (!gl) return;

    this.disposeTextures();

    this.videoAspect = video.videoWidth / video.videoHeight;
    this.depthWidth = depthWidth;
    this.depthHeight = depthHeight;

    // --- Video texture (TEXTURE_UNIT 0) ---
    this.videoTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // --- Raw depth texture (TEXTURE_UNIT 2) ---
    // Receives raw interpolated depth from CPU. Used as input to the
    // bilateral filter pass.
    this.rawDepthTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.rawDepthTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, depthWidth, depthHeight);

    // --- Filtered depth texture (TEXTURE_UNIT 1) ---
    // Output of the bilateral filter pass. Read by the parallax shader.
    this.filteredDepthTexture = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.filteredDepthTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.R8, depthWidth, depthHeight);

    // --- Bilateral filter FBO ---
    // Renders the bilateral filter output into filteredDepthTexture.
    this.depthFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFbo);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
      this.filteredDepthTexture, 0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // --- Set bilateral filter uniforms ---
    if (this.bilateralProgram && this.bilateralUniforms) {
      gl.useProgram(this.bilateralProgram);
      gl.uniform1i(this.bilateralUniforms.uRawDepth, 2);
      gl.uniform2f(this.bilateralUniforms.uTexelSize, 1.0 / depthWidth, 1.0 / depthHeight);
    }

    // --- Set parallax shader static uniforms ---
    if (this.program && this.uniforms) {
      gl.useProgram(this.program);

      // Texture unit bindings: video=0, filtered depth=1
      gl.uniform1i(this.uniforms.uImage, 0);
      gl.uniform1i(this.uniforms.uDepth, 1);

      // Static shader parameters (set once, never updated per-frame)
      gl.uniform1f(this.uniforms.uStrength, this.config.parallaxStrength);
      gl.uniform1i(this.uniforms.uPomEnabled, this.config.pomEnabled ? 1 : 0);
      gl.uniform1i(this.uniforms.uPomSteps, this.config.pomSteps);
      gl.uniform1f(this.uniforms.uContrastLow, this.config.contrastLow);
      gl.uniform1f(this.uniforms.uContrastHigh, this.config.contrastHigh);
      gl.uniform1f(this.uniforms.uVerticalReduction, this.config.verticalReduction);
      gl.uniform1f(this.uniforms.uDofStart, this.config.dofStart);
      gl.uniform1f(this.uniforms.uDofStrength, this.config.dofStrength);
      gl.uniform2f(this.uniforms.uImageTexelSize, 1.0 / video.videoWidth, 1.0 / video.videoHeight);
    }

    // Size everything to the current viewport.
    this.recalculateViewportLayout();
  }

  /**
   * Begin the render loop.
   *
   * When `requestVideoFrameCallback` is available, two loops run:
   * 1. RVFC loop — fires once per new video frame, handles depth update.
   * 2. RAF loop — fires at display refresh rate, handles input + render.
   *
   * When RVFC is not available, falls back to a single RAF loop that
   * does everything (the pre-RVFC behavior).
   */
  start(
    video: HTMLVideoElement,
    readDepth: (timeSec: number) => Uint8Array,
    readInput: () => ParallaxInput,
    onVideoFrame?: (currentTime: number, frameNumber: number) => void
  ): void {
    this.stop();

    this.playbackVideo = video;
    this.readDepth = readDepth;
    this.readInput = readInput;
    this.onVideoFrame = onVideoFrame ?? null;

    // Feature-detect RVFC on this specific video element.
    this.rvfcSupported = ParallaxRenderer.isRVFCSupported();

    // Start the RVFC loop for depth updates (only when supported).
    if (this.rvfcSupported) {
      this.rvfcHandle = video.requestVideoFrameCallback(this.videoFrameLoop);
    }

    // Always start the RAF loop for input + rendering.
    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
  }

  /** Stop both render loops and release callbacks. */
  stop(): void {
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }

    // Cancel the RVFC loop if active.
    if (this.rvfcHandle && this.playbackVideo) {
      this.playbackVideo.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = 0;
    }

    this.playbackVideo = null;
    this.readDepth = null;
    this.readInput = null;
    this.onVideoFrame = null;
    this.rvfcSupported = false;
  }

  /** Stop rendering and release all GPU resources. */
  dispose(): void {
    this.stop();
    this.disposeTextures();
    this.disposeGPUResources();

    this.canvas.removeEventListener('webglcontextlost', this.handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);

    // Explicitly release the WebGL context to free GPU resources.
    // Without this, contexts leak until the canvas is garbage collected.
    if (this.gl) {
      const ext = this.gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
      this.gl = null;
    }
    this.canvas.remove();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.scheduleResizeRecalculate);
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // GPU resource initialization
  // -----------------------------------------------------------------------

  /** Create shader programs, fullscreen quad VAOs, and cache uniform locations. */
  private initGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    // --- Bilateral filter program ---
    const bilateralVert = compileShader(gl, gl.VERTEX_SHADER, BILATERAL_VERTEX_SHADER);
    const bilateralFrag = compileShader(gl, gl.FRAGMENT_SHADER, BILATERAL_FRAGMENT_SHADER);
    this.bilateralProgram = linkProgram(gl, bilateralVert, bilateralFrag);
    this.bilateralUniforms = getBilateralUniformLocations(gl, this.bilateralProgram);

    // Bilateral filter VAO (same fullscreen quad geometry, separate VAO).
    const quadVertices = new Float32Array([
      -1, -1,
       1, -1,
      -1,  1,
       1,  1,
    ]);

    this.bilateralVao = gl.createVertexArray();
    gl.bindVertexArray(this.bilateralVao);
    const bilateralVbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, bilateralVbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);
    const bilateralAPos = gl.getAttribLocation(this.bilateralProgram, 'aPosition');
    gl.enableVertexAttribArray(bilateralAPos);
    gl.vertexAttribPointer(bilateralAPos, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // --- Parallax program ---
    // Inject MAX_POM_STEPS as a #define into the fragment shader.
    const fragSource = FRAGMENT_SHADER.replace(
      '#version 300 es',
      `#version 300 es\n#define MAX_POM_STEPS ${ParallaxRenderer.MAX_POM_STEPS}`
    );

    const vertShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSource);
    this.program = linkProgram(gl, vertShader, fragShader);
    this.uniforms = getUniformLocations(gl, this.program);

    // --- Parallax fullscreen quad VAO ---
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, quadVertices, gl.STATIC_DRAW);

    const aPosition = gl.getAttribLocation(this.program, 'aPosition');
    gl.enableVertexAttribArray(aPosition);
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);

    gl.bindVertexArray(null);

    // Disable depth testing — single fullscreen quad, no depth needed.
    gl.disable(gl.DEPTH_TEST);
  }

  // -----------------------------------------------------------------------
  // RVFC feature detection
  // -----------------------------------------------------------------------

  /** Check whether requestVideoFrameCallback is available. */
  private static isRVFCSupported(): boolean {
    return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  }

  // -----------------------------------------------------------------------
  // Video frame loop (RVFC) — depth updates at video frame rate
  // -----------------------------------------------------------------------

  /**
   * RVFC callback — fires only when the browser presents a new video frame.
   *
   * Handles the depth texture upload and bilateral filter pass, which
   * only needs to happen when the video frame actually changes
   * (~24-30fps, not 60-120fps).
   */
  private readonly videoFrameLoop = (
    _now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) => {
    const video = this.playbackVideo;
    if (!video) return;

    // Re-register for the next frame immediately.
    this.rvfcHandle = video.requestVideoFrameCallback(this.videoFrameLoop);

    const timeSec = metadata.mediaTime ?? video.currentTime;

    // Upload raw depth and run bilateral filter pass.
    this.updateDepthTexture(timeSec);

    // Notify consumer (Web Component uses this for the 'frame' event).
    if (this.onVideoFrame) {
      this.onVideoFrame(timeSec, metadata.presentedFrames ?? 0);
    }
  };

  // -----------------------------------------------------------------------
  // Render loop (RAF) — input + render at display refresh rate
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
  private readonly renderLoop = () => {
    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);

    const gl = this.gl;
    const video = this.playbackVideo;
    if (!gl || !this.program || !this.uniforms || !this.vao) {
      return;
    }

    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      // Skip this frame — keep the previous frame on screen.
      // This avoids a flash to black during video loop transitions
      // where readyState briefly drops.
      return;
    }

    gl.useProgram(this.program);

    // Upload the current video frame to the GPU.
    // Y-flip is handled globally (UNPACK_FLIP_Y_WEBGL set once in constructor).
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.videoTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

    // Fallback: when RVFC is not supported, do depth update here.
    if (!this.rvfcSupported) {
      this.updateDepthTexture(video.currentTime);
    }

    // Update the parallax offset from mouse/gyro input — always at RAF rate.
    // x is negated so that moving the mouse right shifts the image left,
    // revealing content from the right — matching real parallax behavior.
    if (this.readInput) {
      const input = this.readInput();
      gl.uniform2f(this.uniforms.uOffset, -input.x, input.y);
    }

    // Draw the fullscreen quad (reads filtered depth from TEXTURE_UNIT 1).
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  /**
   * Upload raw depth data to the GPU and run the bilateral filter pass.
   *
   * 1. Uploads the raw interpolated Uint8Array to rawDepthTexture (UNIT 2).
   * 2. Binds the FBO targeting filteredDepthTexture.
   * 3. Runs the bilateral filter shader (reads UNIT 2, writes to FBO).
   * 4. Unbinds the FBO so subsequent draws go to the screen.
   *
   * The parallax shader reads from filteredDepthTexture (UNIT 1).
   */
  private updateDepthTexture(timeSec: number): void {
    const gl = this.gl;
    if (
      !gl || !this.readDepth ||
      !this.rawDepthTexture || !this.filteredDepthTexture ||
      !this.depthFbo || !this.bilateralProgram ||
      !this.bilateralUniforms || !this.bilateralVao
    ) return;

    // 1. Upload raw depth data to the raw depth texture.
    const depthData = this.readDepth(timeSec);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.rawDepthTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D, 0,
      0, 0,
      this.depthWidth, this.depthHeight,
      gl.RED, gl.UNSIGNED_BYTE,
      depthData
    );

    // 2. Run bilateral filter: render into filteredDepthTexture via FBO.
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.depthFbo);
    gl.viewport(0, 0, this.depthWidth, this.depthHeight);

    gl.useProgram(this.bilateralProgram);
    gl.bindVertexArray(this.bilateralVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 3. Restore: unbind FBO and reset viewport to canvas size.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

  /**
   * Set up a ResizeObserver on the container element and a fallback
   * window resize listener.
   */
  private setupResizeHandling(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleResizeRecalculate();
      });
      this.resizeObserver.observe(this.container);
    }

    window.addEventListener('resize', this.scheduleResizeRecalculate);
    this.recalculateViewportLayout();
  }

  /** Debounce resize events to avoid expensive layout recalculations. */
  private readonly scheduleResizeRecalculate = () => {
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.recalculateViewportLayout();
    }, ParallaxRenderer.RESIZE_DEBOUNCE_MS);
  };

  /**
   * Recalculate the WebGL canvas size and UV transform to match the
   * current container dimensions.
   *
   * Cover-fit + overscan is expressed as a UV-space transform (offset + scale)
   * rather than geometry resize. The fullscreen quad stays fixed at -1 to 1.
   */
  private recalculateViewportLayout(): void {
    const gl = this.gl;
    if (!gl) return;

    const { width, height } = this.getViewportSize();
    const dpr = Math.min(window.devicePixelRatio, 2);

    // Set the canvas drawing buffer to match the container at the device pixel ratio.
    const bufferWidth = Math.round(width * dpr);
    const bufferHeight = Math.round(height * dpr);

    if (this.canvas.width !== bufferWidth || this.canvas.height !== bufferHeight) {
      this.canvas.width = bufferWidth;
      this.canvas.height = bufferHeight;
      gl.viewport(0, 0, bufferWidth, bufferHeight);
    }

    // Compute cover-fit UV transform.
    // The video fills the viewport (cover-fit), and overscan adds extra
    // visible area so parallax displacement doesn't reveal edges.
    //
    // In UV space, scale < 1 means we sample a SUBSET of the texture
    // (zooming in / cropping). For cover-fit, the limiting axis maps 1:1
    // and the overflowing axis is cropped (scale < 1).
    const viewportAspect = width / height;
    const extra = this.config.parallaxStrength + this.config.overscanPadding;

    let scaleU = 1.0;
    let scaleV = 1.0;

    if (viewportAspect > this.videoAspect) {
      // Viewport is wider — match width, crop top/bottom
      scaleV = this.videoAspect / viewportAspect;
    } else {
      // Viewport is taller — match height, crop left/right
      scaleU = viewportAspect / this.videoAspect;
    }

    // Apply overscan: zoom in further so parallax displacement doesn't
    // reveal texture edges. Dividing reduces the UV range (more zoom).
    const overscanScale = 1.0 + extra * 2;
    scaleU /= overscanScale;
    scaleV /= overscanScale;

    // Center the UV mapping: offset = (1 - scale) / 2
    this.uvOffset = [(1.0 - scaleU) / 2.0, (1.0 - scaleV) / 2.0];
    this.uvScale = [scaleU, scaleV];

    // Update the UV transform uniforms.
    if (this.program && this.uniforms) {
      gl.useProgram(this.program);
      gl.uniform2f(this.uniforms.uUvOffset, this.uvOffset[0], this.uvOffset[1]);
      gl.uniform2f(this.uniforms.uUvScale, this.uvScale[0], this.uvScale[1]);
    }
  }

  /** Read the container's pixel dimensions, with a minimum of 1x1. */
  private getViewportSize(): { width: number; height: number } {
    const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight));
    return { width, height };
  }

  // -----------------------------------------------------------------------
  // Context loss handling
  // -----------------------------------------------------------------------

  private readonly handleContextLost = (event: Event) => {
    event.preventDefault();
    // Stop the render loop — GPU resources are invalid.
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
  };

  private readonly handleContextRestored = () => {
    // Re-acquire the context and rebuild all GPU resources.
    const gl = this.canvas.getContext('webgl2');
    if (!gl) return;
    this.gl = gl;
    gl.clearColor(0, 0, 0, 1);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    this.initGPUResources();

    // Re-initialize textures if we had them before.
    if (this.playbackVideo && this.depthWidth > 0) {
      this.initialize(this.playbackVideo, this.depthWidth, this.depthHeight);
    }

    // Restart the render loop.
    if (this.playbackVideo) {
      this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
    }
  };

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Dispose textures and FBO only. */
  private disposeTextures(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.videoTexture) {
      gl.deleteTexture(this.videoTexture);
      this.videoTexture = null;
    }
    if (this.rawDepthTexture) {
      gl.deleteTexture(this.rawDepthTexture);
      this.rawDepthTexture = null;
    }
    if (this.filteredDepthTexture) {
      gl.deleteTexture(this.filteredDepthTexture);
      this.filteredDepthTexture = null;
    }
    if (this.depthFbo) {
      gl.deleteFramebuffer(this.depthFbo);
      this.depthFbo = null;
    }
  }

  /** Dispose shader programs and VAOs. */
  private disposeGPUResources(): void {
    const gl = this.gl;
    if (!gl) return;

    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    this.uniforms = null;

    if (this.bilateralProgram) {
      gl.deleteProgram(this.bilateralProgram);
      this.bilateralProgram = null;
    }
    if (this.bilateralVao) {
      gl.deleteVertexArray(this.bilateralVao);
      this.bilateralVao = null;
    }
    this.bilateralUniforms = null;
  }
}
