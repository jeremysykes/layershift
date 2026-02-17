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
 * 2. The depth interpolator produces a Float32Array for the current
 *    playback time (interpolated between precomputed 5fps keyframes).
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
 * upload) + 1 depth DataTexture (512×512 Float32 = 1 MB). This is
 * ~5× less than the old 5-layer RGBA system (5.2 MB/frame).
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
   * Uploaded as RedFormat + FloatType DataTexture at depth resolution.
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

  // ---- Varyings ----

  /** Interpolated texture coordinates from vertex shader. */
  varying vec2 vUv;

  // ---- Displacement functions ----

  /**
   * Basic UV displacement.
   *
   * Offsets the sampling position proportionally to the depth at this
   * fragment. Inverts depth so that near pixels (depth ≈ 0) receive
   * maximum displacement and far pixels (depth ≈ 1) receive none.
   *
   * The displacement direction follows the input offset, creating
   * apparent perspective shift as the user moves their mouse or
   * tilts their device.
   */
  vec2 basicDisplace(vec2 uv) {
    float depth = texture2D(uDepth, uv).r;

    // Invert: near (0) → max displacement, far (1) → no displacement
    float displacement = (1.0 - depth) * uStrength;

    return uv + uOffset * displacement;
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
   */
  vec2 pomDisplace(vec2 uv) {
    // How much accumulated depth increases per step
    float layerDepth = 1.0 / float(uPomSteps);

    // UV step per layer — total displacement spread across all steps
    vec2 deltaUV = uOffset * uStrength / float(uPomSteps);

    // State: current position along the ray
    float currentLayerDepth = 0.0;
    vec2 currentUV = uv;

    // March through the depth volume
    for (int i = 0; i < MAX_POM_STEPS; i++) {
      // Runtime loop bound (MAX_POM_STEPS is the compile-time max)
      if (i >= uPomSteps) break;

      // Sample the depth map and invert (near=1, far=0 for comparison)
      float depthAtUV = 1.0 - texture2D(uDepth, currentUV).r;

      // Has the ray crossed below the depth surface?
      if (currentLayerDepth > depthAtUV) {
        // Step back to previous position for interpolation
        vec2 prevUV = currentUV - deltaUV;
        float prevLayerDepth = currentLayerDepth - layerDepth;
        float prevDepthAtUV = 1.0 - texture2D(uDepth, prevUV).r;

        // Linear interpolation between the two bracketing samples.
        // afterDepth = how far the ray overshot at currentUV
        // beforeDepth = how far the ray was above at prevUV
        float afterDepth = depthAtUV - currentLayerDepth;
        float beforeDepth = prevDepthAtUV - prevLayerDepth;
        float t = afterDepth / (afterDepth - beforeDepth);

        return mix(currentUV, prevUV, t);
      }

      // Advance the ray
      currentUV += deltaUV;
      currentLayerDepth += layerDepth;
    }

    // No intersection found — return the final marched position
    return currentUV;
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
    gl_FragColor = texture2D(uImage, displaced);
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
  private readDepth: ((timeSec: number) => Float32Array) | null = null;
  private readInput: (() => ParallaxInput) | null = null;
  private playbackVideo: HTMLVideoElement | null = null;

  // ---- Animation & resize ----
  private animationFrameHandle = 0;
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
    // Single-channel Float32 texture holding the interpolated depth map.
    // Updated each frame by copying the Float32Array from the
    // DepthFrameInterpolator into the texture's backing data.
    const depthData = new Float32Array(depthWidth * depthHeight);
    this.depthTexture = new THREE.DataTexture(
      depthData,
      depthWidth,
      depthHeight,
      THREE.RedFormat,
      THREE.FloatType
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
   * @param readDepth - Called each frame with the current video time.
   *   Returns a Float32Array of depth values (0=near, 1=far) at the
   *   depth texture's resolution (e.g. 512×512).
   * @param readInput - Called each frame. Returns the smoothed
   *   parallax input {x, y} in [-1, 1].
   */
  start(
    video: HTMLVideoElement,
    readDepth: (timeSec: number) => Float32Array,
    readInput: () => ParallaxInput
  ): void {
    this.stop();

    this.playbackVideo = video;
    this.readDepth = readDepth;
    this.readInput = readInput;

    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
  }

  /** Stop the render loop and release callbacks. */
  stop(): void {
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
    this.playbackVideo = null;
    this.readDepth = null;
    this.readInput = null;
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
  // Render loop
  // -----------------------------------------------------------------------

  /**
   * Main render loop — called every animation frame.
   *
   * 1. Copies the interpolated depth into the GPU depth texture.
   * 2. Updates the parallax offset uniform from input.
   * 3. THREE.VideoTexture auto-updates the video color.
   * 4. Renders the scene (single draw call).
   */
  private readonly renderLoop = () => {
    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);

    const video = this.playbackVideo;
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // Update depth texture from the interpolator.
    // This copies the Float32Array into the DataTexture's backing buffer
    // and marks it for re-upload to the GPU (~1 MB at 512×512).
    if (this.readDepth && this.depthTexture) {
      const depthData = this.readDepth(video.currentTime);
      (this.depthTexture.image.data as Float32Array).set(depthData);
      this.depthTexture.needsUpdate = true;
    }

    // Update the parallax offset from mouse/gyro input.
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
