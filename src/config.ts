/**
 * Application-wide configuration for the Layershift parallax video pipeline.
 *
 * The parallax effect works by displacing UV coordinates in a fragment shader
 * based on a per-pixel depth map. The video is rendered at native display
 * resolution via a WebGL video texture, while a precomputed depth map (512x512)
 * drives the displacement.
 *
 * Two rendering modes are available:
 *
 * 1. **Basic displacement** (default): Each fragment's UV is shifted by
 *    `input * (1 - depth) * strength`. Near pixels move more, far less.
 *    Fast (2 texture lookups per fragment) but does not handle occlusion.
 *
 * 2. **Parallax Occlusion Mapping (POM)**: A ray is marched through the
 *    depth field to find the correct surface intersection. Near objects
 *    correctly cover far objects at larger offsets, at the cost of
 *    `pomSteps` extra texture lookups per fragment.
 */
export const APP_CONFIG = {
  /** Path to the source video served from /public. */
  videoUrl: '/videos/parallax/fashion-rain/video.mp4',

  /** Path to the packed binary depth data (4-byte header + Uint8 frames). */
  depthDataUrl: '/videos/parallax/fashion-rain/depth-data.bin',

  /** Path to the JSON metadata describing the depth data layout. */
  depthMetaUrl: '/videos/parallax/fashion-rain/depth-meta.json',

  /**
   * Maximum width for depth processing. The precomputed depth maps are
   * generated at this resolution. Does not affect the color video resolution,
   * which is sampled at native display resolution via the video texture.
   */
  workingMaxWidth: 512,

  /**
   * Parallax displacement strength in UV space.
   *
   * A value of 0.05 means the maximum UV offset at full input is 5% of the
   * texture coordinate range. At 1920px display width this produces ~96px
   * of apparent motion — roughly 3x the old discrete-layer system's 30px.
   *
   * Increase for a more dramatic depth effect; decrease for subtlety.
   */
  parallaxStrength: 0.05,

  /**
   * Whether to enable Parallax Occlusion Mapping (POM) ray-marching.
   *
   * When enabled, the fragment shader marches a ray through the depth field
   * to find the correct surface intersection. This produces self-occlusion:
   * near objects correctly cover far objects when the viewpoint shifts.
   *
   * Costs `pomSteps` additional texture lookups per fragment.
   */
  pomEnabled: true,

  /**
   * Number of ray-march steps for POM. More steps = smoother intersection
   * finding but higher GPU cost.
   *
   * - 16: Good balance for moderate offsets
   * - 32: High quality for large parallaxStrength values
   *
   * Only used when `pomEnabled` is true.
   */
  pomSteps: 16,

  /**
   * Extra scale applied to the plane beyond what cover-fit requires,
   * expressed as a fraction of the viewport dimension.
   *
   * Prevents the video edge from becoming visible when the parallax
   * offset shifts the texture. Should be >= parallaxStrength to avoid
   * edge reveal at maximum input.
   */
  overscanPadding: 0.08,

  /**
   * Smoothing factor for mouse/gyro input interpolation (0-1).
   *
   * Each frame, the current input is lerped toward the target by this
   * factor. Lower = smoother but laggier; higher = more responsive
   * but potentially jittery.
   */
  motionLerpFactor: 0.1,
} as const;
