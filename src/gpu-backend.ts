/**
 * GPU Backend Detection — WebGPU / WebGL2 feature detection and selection.
 *
 * Provides async detection with a timeout to gracefully fall back to WebGL2
 * when WebGPU is unavailable or adapter request hangs.
 *
 * Default behavior: auto-detect. WebGPU is used when available, WebGL2 fallback.
 * The `gpu-backend` attribute on Web Components is an optional escape hatch.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GPUBackendType = 'webgpu' | 'webgl2';

export interface GPUBackendInfo {
  readonly type: GPUBackendType;
  /** Present only when type === 'webgpu'. */
  readonly adapter?: GPUAdapter;
  /** Present only when type === 'webgpu'. */
  readonly device?: GPUDevice;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum time to wait for adapter request before falling back to WebGL2. */
const ADAPTER_TIMEOUT_MS = 1500;

// ---------------------------------------------------------------------------
// Sync check
// ---------------------------------------------------------------------------

/**
 * Synchronous check for WebGPU API availability.
 *
 * Returns true if `navigator.gpu` exists. Does NOT request an adapter,
 * so this cannot confirm actual WebGPU support — use `detectGPUBackend()`
 * for a definitive answer.
 */
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

// ---------------------------------------------------------------------------
// Async detection
// ---------------------------------------------------------------------------

/**
 * Detect the best available GPU backend.
 *
 * 1. If `preference` is 'webgl2', returns WebGL2 immediately.
 * 2. If `preference` is 'webgpu', attempts WebGPU and throws on failure.
 * 3. If `preference` is 'auto' (default), tries WebGPU with a timeout
 *    and falls back to WebGL2 silently on any failure.
 *
 * @param preference - 'webgpu' | 'webgl2' | 'auto' (default: 'auto')
 */
export async function detectGPUBackend(
  preference: 'webgpu' | 'webgl2' | 'auto' = 'auto'
): Promise<GPUBackendInfo> {
  // Short-circuit: explicit WebGL2
  if (preference === 'webgl2') {
    return { type: 'webgl2' };
  }

  // Attempt WebGPU
  if (!isWebGPUAvailable()) {
    if (preference === 'webgpu') {
      throw new Error('WebGPU not available: navigator.gpu is undefined');
    }
    return { type: 'webgl2' };
  }

  try {
    const adapter = await requestAdapterWithTimeout();
    if (!adapter) {
      if (preference === 'webgpu') {
        throw new Error('WebGPU adapter request returned null');
      }
      return { type: 'webgl2' };
    }

    const device = await adapter.requestDevice();

    return {
      type: 'webgpu',
      adapter,
      device,
    };
  } catch (err) {
    if (preference === 'webgpu') {
      throw err;
    }
    // Auto mode: fall back silently
    return { type: 'webgl2' };
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Request a WebGPU adapter with a timeout to prevent hanging. */
async function requestAdapterWithTimeout(): Promise<GPUAdapter | null> {
  const adapterPromise = navigator.gpu.requestAdapter({
    powerPreference: 'high-performance',
  });

  const timeoutPromise = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), ADAPTER_TIMEOUT_MS);
  });

  return Promise.race([adapterPromise, timeoutPromise]);
}
