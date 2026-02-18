/**
 * Parallax Renderer — GPU-accelerated depth-aware video parallax.
 *
 * Renders a single full-viewport plane textured with the source video
 * (via THREE.VideoTexture) and a precomputed depth map. A custom
 * fragment shader displaces UV coordinates per-pixel based on the
 * depth value and current mouse/gyro input, creating a continuous
 * parallax effect with no discrete layer banding.
 *
 * ## Rendering pipeline (per frame)
 *
 * 1. THREE.VideoTexture auto-updates from the <video> element,
 *    providing the color frame at native display resolution.
 *
 * 2. The depth interpolator produces a Uint8Array for the current
 *    playback time (interpolated between precomputed 5fps keyframes,
 *    bilateral-filtered on the CPU, then quantized to 0-255).
 *    This is copied into a single-channel DataTexture on the GPU.
 *
 * 3. The InputHandler provides a smoothed {x, y} offset in [-1, 1].
 *    This is passed to the shader as the uOffset uniform.
 *
 * 4. The fragment shader samples the depth map at each pixel's UV,
 *    computes a UV displacement proportional to (1 - depth) * strength,
 *    and samples the video texture at the displaced coordinates.
 *    Near objects (depth ≈ 0) move more; far objects (depth ≈ 1) less.
 *
 * 5. When POM is enabled, the shader ray-marches through the depth
 *    field to find the correct surface intersection, producing
 *    self-occlusion (near objects cover far objects behind them).
 *
 * ## Texture memory
 *
 * Only 2 textures per frame: 1 VideoTexture (GPU-managed, zero CPU
 * upload) + 1 depth DataTexture (1024×1024 Uint8 = 1 MB, uploaded
 * only when depth changes at ~5fps). This is ~5× less bandwidth
 * than the old 5-layer RGBA system.
 */

import * as THREE from 'three';
import type { ParallaxInput } from './input-handler';

// ---------------------------------------------------------------------------
// GLSL Shaders
// ---------------------------------------------------------------------------

/**
 * Vertex shader — trivial pass-through.
 *
 * Transforms the vertex position into clip space and forwards the
 * mesh UV coordinates to the fragment shader for texture sampling.
 * All the interesting work happens in the fragment shader.
 */
const VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
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
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  // ---- Uniforms ----

  /** Color video frame, auto-updated by THREE.VideoTexture. */
  uniform sampler2D uImage;

  /**
   * Single-channel depth map (R channel, 0=near, 1=far).
   * Pre-filtered with a bilateral filter on the CPU before upload,
   * so a single texture2D() read gives smooth, edge-preserving depth.
   * Uploaded as RedFormat + UnsignedByteType (auto-normalized to [0,1]).
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

  /**
   * Texel size for video/image texture (1.0 / videoResolution).
   * Used by the depth-of-field effect to sample neighboring pixels.
   */
  uniform vec2 uImageTexelSize;

  // ---- Varyings ----

  /** Interpolated texture coordinates from vertex shader. */
  varying vec2 vUv;

  // ---- Helper functions ----

  /**
   * Compute an edge fade factor that reduces displacement near UV
   * boundaries.
   *
   * Without this, pixels near the texture edge can get displaced
   * past the valid [0,1] range. The UV clamp catches this, but
   * the clamped region appears as a stretched band. By smoothly
   * reducing displacement to zero near edges, the fade prevents
   * visible edge artifacts.
   *
   * The fade margin is proportional to the parallax strength so
   * it adapts automatically if strength is tuned.
   */
  float edgeFade(vec2 uv) {
    float margin = uStrength * 1.5;
    float fadeX = smoothstep(0.0, margin, uv.x) * smoothstep(0.0, margin, 1.0 - uv.x);
    float fadeY = smoothstep(0.0, margin, uv.y) * smoothstep(0.0, margin, 1.0 - uv.y);
    return fadeX * fadeY;
  }

  /**
   * Compute a subtle vignette darkening factor.
   *
   * Darkens the edges and corners of the frame, which serves two
   * purposes:
   * 1. Hides any remaining edge displacement artifacts
   * 2. Adds a cinematic focus effect that draws the eye to center
   *
   * Applied using the original vUv (not displaced UV) so the
   * darkening stays stable and doesn't shift with parallax movement.
   */
  float vignette(vec2 uv) {
    float dist = length(uv - 0.5) * 1.4;
    return 1.0 - pow(dist, 2.5);
  }

  // ---- Displacement functions ----

  /**
   * Basic UV displacement with edge fade.
   *
   * Offsets the sampling position proportionally to the depth at this
   * fragment. Inverts depth so that near pixels (depth ≈ 0) receive
   * maximum displacement and far pixels (depth ≈ 1) receive none.
   *
   * The depth texture is pre-filtered with a bilateral filter on the
   * CPU, so a single texture2D() read returns smooth, edge-preserving
   * depth. The GPU's hardware bilinear interpolation (LinearFilter)
   * provides sub-texel smoothing on top.
   *
   * A smoothstep contrast curve pushes mid-tones for cleaner
   * separation between foreground and background.
   *
   * Vertical displacement is halved — our eyes are much more
   * sensitive to horizontal parallax, and full vertical displacement
   * tends to look unnatural.
   */
  vec2 basicDisplace(vec2 uv) {
    float depth = texture2D(uDepth, uv).r;

    // Contrast curve: pushes mid-tones toward 0 or 1, reducing
    // noisy mid-depth artifacts while keeping the near/far split clean.
    depth = smoothstep(0.05, 0.95, depth);

    // Invert: near (0) → max displacement, far (1) → no displacement
    float displacement = (1.0 - depth) * uStrength;

    // Reduce displacement near edges to prevent border stretching
    displacement *= edgeFade(uv);

    // Apply offset with reduced vertical component (0.5x).
    // Horizontal parallax is the primary depth cue — vertical
    // parallax at full strength looks like floating/swimming.
    vec2 offset = uOffset * displacement;
    offset.y *= 0.5;

    return uv + offset;
  }

  /**
   * Parallax Occlusion Mapping (POM) ray-marching displacement.
   *
   * Conceptually, imagine the depth map as a heightfield surface viewed
   * from above. When the viewpoint shifts (uOffset), we need to find
   * which point on that surface each pixel ray intersects.
   *
   * The algorithm:
   * 1. Start at the fragment's UV with accumulated depth = 0
   * 2. Step along the offset direction, adding layerDepth each step
   * 3. At each step, compare accumulated depth against the depth map
   * 4. When accumulated > map depth, the ray has crossed the surface
   * 5. Interpolate between the crossing and previous step for precision
   *
   * This produces correct self-occlusion: when the viewpoint shifts
   * right, near objects slide right and cover far objects to their
   * right, just like real parallax.
   *
   * Performance: Each step requires only 1 depth texture read (the
   * bilateral filter runs on the CPU at depth-frame rate, not here).
   * With 16 steps, total depth reads = 16 + 1 (interpolation) = 17.
   */
  vec2 pomDisplace(vec2 uv) {
    // How much accumulated depth increases per step
    float layerDepth = 1.0 / float(uPomSteps);

    // Apply reduced vertical component for POM offset too
    vec2 scaledOffset = uOffset;
    scaledOffset.y *= 0.5;

    // UV step per layer — total displacement spread across all steps
    vec2 deltaUV = scaledOffset * uStrength / float(uPomSteps);

    // State: current position along the ray
    float currentLayerDepth = 0.0;
    vec2 currentUV = uv;

    // Edge fade applied to overall displacement
    float fade = edgeFade(uv);

    // March through the depth volume
    for (int i = 0; i < MAX_POM_STEPS; i++) {
      // Runtime loop bound (MAX_POM_STEPS is the compile-time max)
      if (i >= uPomSteps) break;

      // Single texture read per step — depth is pre-filtered on the CPU
      float rawDepth = texture2D(uDepth, currentUV).r;
      rawDepth = smoothstep(0.05, 0.95, rawDepth);
      float depthAtUV = 1.0 - rawDepth;

      // Has the ray crossed below the depth surface?
      if (currentLayerDepth > depthAtUV) {
        // Step back to previous position for interpolation
        vec2 prevUV = currentUV - deltaUV;
        float prevLayerDepth = currentLayerDepth - layerDepth;
        float prevRaw = texture2D(uDepth, prevUV).r;
        prevRaw = smoothstep(0.05, 0.95, prevRaw);
        float prevDepthAtUV = 1.0 - prevRaw;

        // Linear interpolation between the two bracketing samples.
        float afterDepth = depthAtUV - currentLayerDepth;
        float beforeDepth = prevDepthAtUV - prevLayerDepth;
        float t = afterDepth / (afterDepth - beforeDepth);

        vec2 hitUV = mix(currentUV, prevUV, t);
        // Blend toward undisplaced UV near edges
        return mix(uv, hitUV, fade);
      }

      // Advance the ray
      currentUV += deltaUV;
      currentLayerDepth += layerDepth;
    }

    // No intersection found — return the final marched position
    return mix(uv, currentUV, fade);
  }

  // ---- Main ----

  void main() {
    // Choose displacement method based on POM toggle
    vec2 displaced = uPomEnabled ? pomDisplace(vUv) : basicDisplace(vUv);

    // Clamp to [0,1] to prevent texture wrapping.
    // The overscan padding on the plane geometry ensures there is valid
    // video content beyond the visible viewport, so clamping rarely
    // activates in practice.
    displaced = clamp(displaced, vec2(0.0), vec2(1.0));

    // Sample the color video at the displaced coordinates
    vec4 color = texture2D(uImage, displaced);

    // --- Depth-of-field hint ---
    // Subtly blur distant objects (depth > 0.6) to reinforce the 3D
    // perception. Near objects stay sharp, background softens slightly.
    // Uses a simple 4-sample cross pattern at 1 texel offset.
    // The blend strength ramps from 0% at depth=0.6 to 40% at depth=1.0.
    // Unconditional to avoid GPU warp divergence on mobile GPUs —
    // mix(color, blurred, 0.0) returns color unchanged for near pixels.
    float dofDepth = texture2D(uDepth, displaced).r;
    float dofStrength = smoothstep(0.6, 1.0, dofDepth) * 0.4;
    vec4 blurred = (
      texture2D(uImage, displaced + vec2( uImageTexelSize.x,  0.0)) +
      texture2D(uImage, displaced + vec2(-uImageTexelSize.x,  0.0)) +
      texture2D(uImage, displaced + vec2( 0.0,  uImageTexelSize.y)) +
      texture2D(uImage, displaced + vec2( 0.0, -uImageTexelSize.y))
    ) * 0.25;
    color = mix(color, blurred, dofStrength);

    // --- Vignette ---
    // Apply subtle edge/corner darkening using the original (undisplaced)
    // UV so the effect stays stable during parallax movement.
    color.rgb *= vignette(vUv);

    gl_FragColor = color;
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
}

// ---------------------------------------------------------------------------
// Renderer class
// ---------------------------------------------------------------------------

export class ParallaxRenderer {
  /** Debounce delay for resize events to avoid layout thrashing. */
  private static readonly RESIZE_DEBOUNCE_MS = 100;

  /** Compile-time upper bound for the POM for-loop in GLSL. */
  private static readonly MAX_POM_STEPS = 64;

  // ---- Three.js objects ----
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly container: HTMLElement;

  // ---- Textures & mesh ----
  private videoTexture: THREE.VideoTexture | null = null;
  private depthTexture: THREE.DataTexture | null = null;
  private mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> | null = null;

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
  private currentPlaneWidth = 0;
  private currentPlaneHeight = 0;

  /**
   * Create the renderer and attach its canvas to the DOM.
   *
   * @param parent - The container element that the WebGL canvas is
   *   appended to. The renderer sizes itself to fill this element.
   * @param config - Parallax-specific settings (strength, POM, overscan).
   */
  constructor(
    parent: HTMLElement,
    private readonly config: ParallaxRendererConfig
  ) {
    this.container = parent;

    // Create the WebGL renderer with standard settings.
    // antialias smooths geometry edges (minimal cost for a single plane).
    // alpha: false since we always fill every pixel with video content.
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);

    // Use sRGB output — VideoTexture provides sRGB data and THREE.js
    // handles the decode/encode pipeline correctly when both the texture
    // and renderer agree on sRGB.
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.container.appendChild(this.renderer.domElement);
    this.setupResizeHandling();
  }

  /**
   * Set up the scene: create VideoTexture, depth DataTexture, and the
   * single mesh with the custom parallax ShaderMaterial.
   *
   * Call this once after the video element and depth data are loaded.
   *
   * @param video - The <video> element to sample color frames from.
   *   Must already have metadata loaded (videoWidth/videoHeight set).
   * @param depthWidth - Width of the precomputed depth map (e.g. 512).
   * @param depthHeight - Height of the precomputed depth map (e.g. 512).
   */
  initialize(video: HTMLVideoElement, depthWidth: number, depthHeight: number): void {
    this.disposeScene();

    this.videoAspect = video.videoWidth / video.videoHeight;

    // --- Video texture ---
    // THREE.VideoTexture auto-updates from the <video> element each
    // frame (internally uses requestVideoFrameCallback if available,
    // otherwise polls). The video provides color at its native
    // resolution — no CPU-side getImageData needed.
    this.videoTexture = new THREE.VideoTexture(video);
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;

    // --- Depth texture ---
    // Single-channel Uint8 texture holding the bilateral-filtered depth map.
    // Updated only when depth changes (~5fps) by copying the Uint8Array
    // from the DepthFrameInterpolator. WebGL auto-normalizes Uint8 [0,255]
    // to float [0,1] in the shader, so no GLSL changes needed.
    // 1024×1024 × 1 byte = 1 MB per upload (vs 4 MB with Float32).
    const depthData = new Uint8Array(depthWidth * depthHeight);
    this.depthTexture = new THREE.DataTexture(
      depthData,
      depthWidth,
      depthHeight,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
    this.depthTexture.flipY = true;
    this.depthTexture.minFilter = THREE.LinearFilter;
    this.depthTexture.magFilter = THREE.LinearFilter;
    this.depthTexture.generateMipmaps = false;
    this.depthTexture.needsUpdate = true;

    // --- Shader material ---
    // Combines the video and depth textures with the parallax
    // displacement logic. Uniforms are updated each frame in the
    // render loop.
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uImage: { value: this.videoTexture },
        uDepth: { value: this.depthTexture },
        uOffset: { value: new THREE.Vector2(0, 0) },
        uStrength: { value: this.config.parallaxStrength },
        uPomEnabled: { value: this.config.pomEnabled },
        uPomSteps: { value: this.config.pomSteps },
        uImageTexelSize: { value: new THREE.Vector2(1.0 / video.videoWidth, 1.0 / video.videoHeight) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      // MAX_POM_STEPS is injected as a #define so the GLSL for-loop
      // has a compile-time constant upper bound (required by WebGL 1.0).
      defines: {
        MAX_POM_STEPS: ParallaxRenderer.MAX_POM_STEPS,
      },
      depthWrite: false,
      depthTest: false,
    });

    // --- Mesh ---
    // A single plane geometry sized to cover the viewport plus overscan.
    // The geometry dimensions are set by recalculateViewportLayout().
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
    this.scene.add(this.mesh);

    // Size everything to the current viewport.
    this.currentPlaneWidth = 0;
    this.currentPlaneHeight = 0;
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
   *
   * @param readDepth - Called with the current video time.
   *   Returns a Uint8Array of depth values (0=near, 255=far) at the
   *   depth texture's resolution. The interpolator handles caching
   *   so redundant calls (same depth frame) return instantly.
   * @param readInput - Returns the smoothed parallax input {x, y}
   *   in [-1, 1].
   * @param onVideoFrame - Optional callback invoked on each new
   *   video frame. Receives the accurate media time and the
   *   browser's presented-frame counter.
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
    this.disposeScene();
    this.renderer.dispose();

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
   * Handles the expensive depth texture update, which only needs to happen
   * when the video frame actually changes (~24-30fps, not 60-120fps).
   *
   * Uses `metadata.mediaTime` for more accurate depth reads than
   * `video.currentTime` (which can lag behind the presented frame).
   */
  private readonly videoFrameLoop = (
    _now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) => {
    const video = this.playbackVideo;
    if (!video) return;

    // Re-register for the next frame immediately.
    this.rvfcHandle = video.requestVideoFrameCallback(this.videoFrameLoop);

    // Use mediaTime (accurate to the presented frame) instead of
    // video.currentTime (which can be stale or ahead).
    const timeSec = metadata.mediaTime ?? video.currentTime;

    // Update depth texture from the interpolator.
    if (this.readDepth && this.depthTexture) {
      const depthData = this.readDepth(timeSec);
      (this.depthTexture.image.data as Uint8Array).set(depthData);
      this.depthTexture.needsUpdate = true;
    }

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
   * 1. Updating the parallax offset uniform from input (buttery smooth).
   * 2. Rendering the scene (single draw call).
   *
   * The depth texture is updated separately by videoFrameLoop at video
   * frame rate. This separation means parallax stays smooth at 60/120fps
   * even though depth only updates at 24-30fps.
   *
   * When RVFC is NOT supported, this falls back to the original behavior:
   * depth update + input update + render all in a single RAF tick.
   */
  private readonly renderLoop = () => {
    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);

    const video = this.playbackVideo;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Fallback: when RVFC is not supported, do depth update here
    // (original behavior — depth reads happen every RAF tick).
    if (!this.rvfcSupported) {
      if (this.readDepth && this.depthTexture) {
        const depthData = this.readDepth(video.currentTime);
        (this.depthTexture.image.data as Uint8Array).set(depthData);
        this.depthTexture.needsUpdate = true;
      }
    }

    // Update the parallax offset from mouse/gyro input — always at RAF rate.
    // x is negated so that moving the mouse right shifts the image left,
    // revealing content from the right — matching real parallax behavior.
    if (this.readInput && this.mesh) {
      const input = this.readInput();
      (this.mesh.material.uniforms.uOffset.value as THREE.Vector2).set(
        -input.x,
        input.y
      );
    }

    // Render. VideoTexture updates automatically from the <video> element.
    this.renderer.render(this.scene, this.camera);
  };

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

  /**
   * Set up a ResizeObserver on the container element and a fallback
   * window resize listener. Both trigger a debounced recalculation
   * of the viewport layout, camera, and plane geometry.
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
   * Recalculate the WebGL canvas size, orthographic camera frustum,
   * and plane geometry to match the current container dimensions.
   *
   * The plane is sized to "cover" the viewport (like CSS object-fit:
   * cover) plus extra overscan padding so that parallax displacement
   * doesn't reveal the plane edges.
   */
  private recalculateViewportLayout(): void {
    const { width, height } = this.getViewportSize();

    // Set the canvas drawing buffer to match the container.
    // The third param (false) means THREE.js won't set inline CSS
    // styles — our CSS handles the display size via width/height: 100%.
    this.renderer.setSize(width, height, false);

    // Update the orthographic camera to match pixel dimensions.
    // This gives us a 1:1 mapping between world units and pixels.
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.position.z = 1;
    this.camera.updateProjectionMatrix();

    // Resize the plane geometry to cover the viewport + overscan.
    const { planeWidth, planeHeight } = this.computeCoverPlaneSize(width, height);

    // Skip if the size hasn't materially changed (avoids geometry churn).
    if (
      Math.abs(this.currentPlaneWidth - planeWidth) < 0.5 &&
      Math.abs(this.currentPlaneHeight - planeHeight) < 0.5
    ) {
      return;
    }
    this.currentPlaneWidth = planeWidth;
    this.currentPlaneHeight = planeHeight;

    if (this.mesh) {
      const oldGeometry = this.mesh.geometry;
      this.mesh.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      oldGeometry.dispose();
    }
  }

  /** Read the container's pixel dimensions, with a minimum of 1×1. */
  private getViewportSize(): { width: number; height: number } {
    const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight));
    return { width, height };
  }

  /**
   * Compute the plane dimensions needed to cover the viewport while
   * preserving the video's aspect ratio, plus overscan padding.
   *
   * "Cover" means the plane is scaled so the shorter axis fills the
   * viewport (the longer axis overflows). Overscan adds extra size
   * proportional to the parallax strength so that maximum displacement
   * never reveals the plane edge.
   *
   * @returns planeWidth/planeHeight in world units (= pixels, since
   *   the camera is set up 1:1).
   */
  private computeCoverPlaneSize(
    viewportWidth: number,
    viewportHeight: number
  ): { planeWidth: number; planeHeight: number } {
    const viewportAspect = viewportWidth / viewportHeight;

    // Cover-fit: scale so the shorter axis fills the viewport.
    let coverWidth = viewportWidth;
    let coverHeight = viewportHeight;
    if (viewportAspect > this.videoAspect) {
      // Viewport is wider than video — match width, overflow height.
      coverHeight = viewportWidth / this.videoAspect;
    } else {
      // Viewport is taller than video — match height, overflow width.
      coverWidth = viewportHeight * this.videoAspect;
    }

    // Overscan: add enough extra size that the maximum parallax
    // displacement (parallaxStrength in UV space) plus a safety margin
    // (overscanPadding) never reveals the plane edge.
    const extra = this.config.parallaxStrength + this.config.overscanPadding;
    const overscanH = coverWidth * extra;
    const overscanV = coverHeight * extra;

    return {
      planeWidth: coverWidth + overscanH * 2,
      planeHeight: coverHeight + overscanV * 2,
    };
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  /** Dispose the mesh, material, and textures from the scene. */
  private disposeScene(): void {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
      this.mesh = null;
    }

    if (this.videoTexture) {
      this.videoTexture.dispose();
      this.videoTexture = null;
    }

    if (this.depthTexture) {
      this.depthTexture.dispose();
      this.depthTexture = null;
    }
  }
}
