/**
 * Adaptive Quality Scaling — device capability probing and tier classification.
 *
 * Probes WebGL context + navigator APIs once at init time, classifies the
 * device into a quality tier (high / medium / low), and resolves concrete
 * parameters that both renderers and Web Components consume to adjust:
 *
 * - **Render resolution** — DPR cap (2.0 / 1.5 / 1.0)
 * - **Depth resolution** — depth texture max dimension (512 / 512 / 256)
 * - **Sample count** — POM steps (16 / 16 / 8), bilateral kernel (5×5 / 5×5 / 3×3)
 * - **JFA resolution** — distance field divisor (2 / 2 / 4) for portal effect
 *
 * Override precedence (unchanged): explicit config > quality-derived > calibrated defaults.
 *
 * @see ADR-012 for the architectural decision and rationale.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Device quality classification. */
export type QualityTier = 'high' | 'medium' | 'low';

/** Concrete rendering parameters resolved from a quality tier. */
export interface QualityParams {
  readonly tier: QualityTier;
  /** Maximum device pixel ratio (2.0 / 1.5 / 1.0). */
  readonly dprCap: number;
  /** Maximum depth texture dimension — depth maps larger than this are downscaled (512 / 512 / 256). */
  readonly depthMaxDim: number;
  /** POM ray-march step count (16 / 16 / 8). */
  readonly pomSteps: number;
  /** Bilateral filter kernel radius in texels — kernel is (2r+1)×(2r+1) (2 / 2 / 1). */
  readonly bilateralRadius: number;
  /** JFA distance field resolution divisor (2 = half-res, 4 = quarter-res). */
  readonly jfaDivisor: number;
  /** Poisson disc sample count for DOF blur (48 / 32 / 16). */
  readonly poissonSamples: number;
  /** DOF buffer resolution divisor (1 = full, 2 = half). */
  readonly dofDivisor: number;
}

/** Raw device capability probe results. */
export interface DeviceCapabilities {
  /** GPU renderer string from WEBGL_debug_renderer_info, or 'unknown'. */
  readonly gpuRenderer: string;
  /** GL_MAX_TEXTURE_SIZE. */
  readonly maxTextureSize: number;
  /** navigator.hardwareConcurrency (logical cores), or 0 if unavailable. */
  readonly hardwareConcurrency: number;
  /** navigator.deviceMemory in GB, or 0 if unavailable. */
  readonly deviceMemory: number;
  /** window.devicePixelRatio. */
  readonly devicePixelRatio: number;
  /** Total screen pixels (width × height). */
  readonly screenPixels: number;
  /** Whether the device appears to be mobile (touch + small screen). */
  readonly isMobile: boolean;
}

// ---------------------------------------------------------------------------
// Tier parameter map
// ---------------------------------------------------------------------------

const TIER_PARAMS: Record<QualityTier, Omit<QualityParams, 'tier'>> = {
  high: {
    dprCap: 2.0,
    depthMaxDim: 512,
    pomSteps: 16,
    bilateralRadius: 2,
    jfaDivisor: 2,
    poissonSamples: 48,
    dofDivisor: 1,
  },
  medium: {
    dprCap: 1.5,
    depthMaxDim: 512,
    pomSteps: 16,
    bilateralRadius: 2,
    jfaDivisor: 2,
    poissonSamples: 32,
    dofDivisor: 1,
  },
  low: {
    dprCap: 1.0,
    depthMaxDim: 256,
    pomSteps: 8,
    bilateralRadius: 1,
    jfaDivisor: 4,
    poissonSamples: 16,
    dofDivisor: 2,
  },
};

// ---------------------------------------------------------------------------
// Device capability probing
// ---------------------------------------------------------------------------

/**
 * Probe device capabilities from the WebGL context and navigator APIs.
 *
 * This is intentionally lightweight — it reads values that are already
 * available (no async, no benchmarks). Called once at init time.
 */
export function probeCapabilities(gl: WebGL2RenderingContext): DeviceCapabilities {
  // GPU renderer string (best effort — extension may be unavailable).
  let gpuRenderer = 'unknown';
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    gpuRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
  }

  const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;

  // Navigator capabilities (gracefully degrade when unavailable).
  const hardwareConcurrency = typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency || 0)
    : 0;
  const deviceMemory = typeof navigator !== 'undefined'
    ? ((navigator as unknown as Record<string, unknown>).deviceMemory as number || 0)
    : 0;
  const devicePixelRatio = typeof window !== 'undefined'
    ? (window.devicePixelRatio || 1)
    : 1;

  const screenPixels = typeof screen !== 'undefined'
    ? (screen.width || 0) * (screen.height || 0)
    : 0;

  // Mobile heuristic: touch support + small screen.
  const hasTouch = typeof navigator !== 'undefined' && (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
  const smallScreen = screenPixels > 0 && screenPixels < 1920 * 1080;
  const isMobile = hasTouch && smallScreen;

  return {
    gpuRenderer,
    maxTextureSize,
    hardwareConcurrency,
    deviceMemory,
    devicePixelRatio,
    screenPixels,
    isMobile,
  };
}

// ---------------------------------------------------------------------------
// Device classification
// ---------------------------------------------------------------------------

/**
 * Known low-end GPU string patterns.
 *
 * Matched case-insensitively against the UNMASKED_RENDERER_WEBGL string.
 * These are integrated GPUs or mobile GPUs that benefit from reduced quality.
 */
const LOW_END_GPU_PATTERNS = [
  'mali-4',
  'mali-t',
  'adreno 3',
  'adreno 4',
  'adreno 5',
  'powervr sgx',
  'intel hd graphics',
  'intel uhd graphics',
  'intel iris',
  'llvmpipe',
  'swiftshader',
  'software',
];

/**
 * Known high-end GPU string patterns.
 */
const HIGH_END_GPU_PATTERNS = [
  'nvidia',
  'geforce',
  'radeon rx',
  'radeon pro',
  'apple m',
  'apple gpu',
  'adreno 7',
  'adreno 6',
  'mali-g7',
  'mali-g6',
];

/**
 * Classify device capabilities into a quality tier using a score-based heuristic.
 *
 * Weighted signals are summed to produce a score:
 * - Score >= 0 → high
 * - Score -25 to -1 → medium
 * - Score < -25 → low
 */
export function classifyDevice(caps: DeviceCapabilities): QualityTier {
  let score = 0;

  // --- GPU renderer signal (strongest weight) ---
  const gpuLower = caps.gpuRenderer.toLowerCase();

  const isLowEndGPU = LOW_END_GPU_PATTERNS.some(p => gpuLower.includes(p));
  const isHighEndGPU = HIGH_END_GPU_PATTERNS.some(p => gpuLower.includes(p));

  if (isLowEndGPU) score -= 30;
  if (isHighEndGPU) score += 20;

  // --- Max texture size signal ---
  // Most modern GPUs support 8192+; older/weaker ones may only do 4096.
  if (caps.maxTextureSize >= 16384) score += 10;
  else if (caps.maxTextureSize >= 8192) score += 5;
  else if (caps.maxTextureSize <= 4096) score -= 15;

  // --- Core count signal ---
  if (caps.hardwareConcurrency >= 8) score += 5;
  else if (caps.hardwareConcurrency >= 4) score += 0;
  else if (caps.hardwareConcurrency > 0 && caps.hardwareConcurrency < 4) score -= 10;

  // --- Device memory signal ---
  if (caps.deviceMemory >= 8) score += 5;
  else if (caps.deviceMemory >= 4) score += 0;
  else if (caps.deviceMemory > 0 && caps.deviceMemory < 4) score -= 15;

  // --- Mobile signal ---
  if (caps.isMobile) score -= 10;

  // --- Classify ---
  if (score >= 0) return 'high';
  if (score >= -25) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve quality parameters for a renderer.
 *
 * - If `quality` is a specific tier ('high' | 'medium' | 'low'), return
 *   that tier's parameters directly (no probing).
 * - If `quality` is 'auto' or undefined, probe device capabilities and
 *   classify automatically.
 *
 * Called once per renderer at construction time. The returned params are
 * stored as `private readonly qualityParams` and read during init and resize.
 *
 * @param gl - WebGL 2 rendering context (used for GPU probing).
 * @param quality - Explicit tier, 'auto', or undefined (defaults to 'auto').
 */
export function resolveQuality(
  gl: WebGL2RenderingContext,
  quality?: 'auto' | QualityTier
): QualityParams {
  const tier = (quality && quality !== 'auto')
    ? quality
    : classifyDevice(probeCapabilities(gl));

  return { tier, ...TIER_PARAMS[tier] };
}

// ---------------------------------------------------------------------------
// WebGPU quality probing
// ---------------------------------------------------------------------------

/**
 * Probe device capabilities from a WebGPU adapter.
 *
 * Extracts the same `DeviceCapabilities` shape as the WebGL2 probe,
 * allowing the shared `classifyDevice()` scoring logic to work for both backends.
 */
export function probeCapabilitiesWebGPU(adapterInfo: GPUAdapterInfo): DeviceCapabilities {
  const gpuRenderer = adapterInfo.description || adapterInfo.device || 'unknown';
  const maxTextureSize = 8192; // conservative default; WebGPU guarantees >= 8192

  const hardwareConcurrency = typeof navigator !== 'undefined'
    ? (navigator.hardwareConcurrency || 0)
    : 0;
  const deviceMemory = typeof navigator !== 'undefined'
    ? ((navigator as unknown as Record<string, unknown>).deviceMemory as number || 0)
    : 0;
  const devicePixelRatio = typeof window !== 'undefined'
    ? (window.devicePixelRatio || 1)
    : 1;

  const screenPixels = typeof screen !== 'undefined'
    ? (screen.width || 0) * (screen.height || 0)
    : 0;

  const hasTouch = typeof navigator !== 'undefined' && (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0
  );
  const smallScreen = screenPixels > 0 && screenPixels < 1920 * 1080;
  const isMobile = hasTouch && smallScreen;

  return {
    gpuRenderer,
    maxTextureSize,
    hardwareConcurrency,
    deviceMemory,
    devicePixelRatio,
    screenPixels,
    isMobile,
  };
}

/**
 * Resolve quality parameters for a WebGPU renderer.
 *
 * Same logic as `resolveQuality()` but accepts a `GPUAdapterInfo` instead
 * of a WebGL context.
 */
export function resolveQualityWebGPU(
  adapterInfo: GPUAdapterInfo,
  quality?: 'auto' | QualityTier
): QualityParams {
  const tier = (quality && quality !== 'auto')
    ? quality
    : classifyDevice(probeCapabilitiesWebGPU(adapterInfo));

  return { tier, ...TIER_PARAMS[tier] };
}
