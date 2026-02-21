/**
 * Browser-based monocular depth estimation using Depth Anything v2 via ONNX Runtime Web.
 *
 * Runs inference on the main thread:
 * - **WebGPU EP** (preferred): GPU-accelerated, ~200ms/frame on modern hardware.
 * - **WASM EP** (fallback): Uses onnxruntime's built-in proxy worker for off-thread execution.
 *
 * A double-buffer pattern bridges async inference (~5fps) with the synchronous
 * `readDepth()` contract that the renderer expects every frame at 60fps.
 *
 * @see ADR-014 for the architectural decision and rationale.
 */

import type { InferenceSession } from 'onnxruntime-web';
import type { TextureImageSource } from './media-source';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Progress information emitted during model download. */
export interface ModelDownloadProgress {
  /** Bytes received so far. */
  receivedBytes: number;
  /** Total bytes (from Content-Length header), or null if unknown. */
  totalBytes: number | null;
  /** Download fraction 0–1 (0 if total is unknown). */
  fraction: number;
  /** Human-readable status label. */
  label: string;
}

/** Callback invoked during model download with progress updates. */
export type OnModelProgress = (progress: ModelDownloadProgress) => void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** ImageNet normalisation constants (Depth Anything v2 input spec). */
const IMAGENET_MEAN = [0.485, 0.456, 0.406] as const;
const IMAGENET_STD  = [0.229, 0.224, 0.225] as const;

/** Native input resolution of Depth Anything v2 (all model sizes). */
const MODEL_INPUT_SIZE = 518;

// ---------------------------------------------------------------------------
// Lazy ONNX Runtime loader
// ---------------------------------------------------------------------------

/**
 * Lazily loaded onnxruntime-web/webgpu module.
 *
 * Dynamic import keeps onnxruntime-web out of the critical bundle path.
 * Tree-shaken entirely from builds that never call `createDepthEstimator()`.
 */
async function loadOrt() {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return await import('onnxruntime-web/webgpu');
}

type OrtModule = Awaited<ReturnType<typeof loadOrt>>;

// ---------------------------------------------------------------------------
// DepthEstimator
// ---------------------------------------------------------------------------

export class DepthEstimator {
  // ONNX session + module (set after init)
  private ort: OrtModule | null = null;
  private session: InferenceSession | null = null;
  private inputName = '';
  private outputName = '';

  // Double-buffer: frontBuffer is read by the renderer (sync),
  // backBuffer receives inference results before being swapped in.
  private frontBuffer: Uint8Array;
  private backBuffer: Uint8Array;

  // Inference throttle — only one inference at a time.
  private inferenceInFlight = false;

  // Ready state
  private readyResolve: (() => void) | null = null;
  private readonly readyPromise: Promise<void>;

  // Frame capture canvas (reused)
  private captureCanvas: HTMLCanvasElement | null = null;
  private captureCtx: CanvasRenderingContext2D | null = null;

  private disposed = false;

  constructor(
    private readonly depthWidth: number,
    private readonly depthHeight: number,
  ) {
    const size = depthWidth * depthHeight;
    this.frontBuffer = new Uint8Array(size);
    this.frontBuffer.fill(128); // Start with mid-gray (flat depth)
    this.backBuffer = new Uint8Array(size);
    this.backBuffer.fill(128);

    this.readyPromise = new Promise<void>(resolve => {
      this.readyResolve = resolve;
    });
  }

  // -----------------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------------

  /**
   * Load the ONNX model and prepare the inference session.
   *
   * Downloads the model with progress tracking, then creates the ONNX
   * session from the in-memory buffer. Tries WebGPU EP first
   * (GPU-accelerated on main thread), falls back to WASM EP.
   */
  async init(modelUrl: string, onProgress?: OnModelProgress): Promise<void> {
    const ort = await loadOrt();
    this.ort = ort;

    // Create the frame capture canvas (hidden, never appended to DOM).
    this.captureCanvas = document.createElement('canvas');
    this.captureCanvas.width = MODEL_INPUT_SIZE;
    this.captureCanvas.height = MODEL_INPUT_SIZE;
    this.captureCtx = this.captureCanvas.getContext('2d', {
      willReadFrequently: true,
    });
    if (!this.captureCtx) {
      throw new Error('[DepthEstimator] Failed to create 2D canvas context.');
    }

    // Download model with progress tracking
    onProgress?.({ receivedBytes: 0, totalBytes: null, fraction: 0, label: 'Downloading depth model…' });
    const modelBuffer = await fetchModelWithProgress(modelUrl, onProgress);

    // Create ONNX session from in-memory buffer
    onProgress?.({ receivedBytes: modelBuffer.byteLength, totalBytes: modelBuffer.byteLength, fraction: 1, label: 'Initialising depth model…' });

    let session: InferenceSession;

    try {
      session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['webgpu'],
      });
      console.log('[DepthEstimator] Using WebGPU execution provider');
    } catch (webgpuErr) {
      console.warn('[DepthEstimator] WebGPU EP unavailable, falling back to WASM:', webgpuErr);
      ort.env.wasm.proxy = true;
      session = await ort.InferenceSession.create(modelBuffer, {
        executionProviders: ['wasm'],
      });
      console.log('[DepthEstimator] Using WASM execution provider (proxy worker)');
    }

    this.session = session;
    this.inputName = session.inputNames[0];
    this.outputName = session.outputNames[0];

    this.readyResolve?.();
    this.readyResolve = null;
  }

  /** Wait for model loading and session creation to complete. */
  waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }

  // -----------------------------------------------------------------------
  // Frame submission
  // -----------------------------------------------------------------------

  /**
   * Submit a frame for depth estimation. Non-blocking.
   *
   * If a previous inference is still in-flight, the frame is silently
   * dropped. This naturally throttles to the model's inference rate (~5fps),
   * matching the precomputed depth cadence.
   */
  submitFrame(source: TextureImageSource): void {
    if (this.inferenceInFlight || !this.session || this.disposed) return;
    this.inferenceInFlight = true;
    void this.runInference(source);
  }

  /**
   * Submit a single frame and wait for the result.
   *
   * Used for still images where we need depth before rendering starts.
   */
  async submitFrameAndWait(source: TextureImageSource): Promise<Uint8Array> {
    if (!this.session || this.disposed) {
      return this.frontBuffer;
    }
    await this.runInference(source);
    return this.frontBuffer;
  }

  // -----------------------------------------------------------------------
  // Sync depth read (called by renderer every RAF frame)
  // -----------------------------------------------------------------------

  /** Return the latest available depth buffer. Always synchronous. */
  getLatestDepth(): Uint8Array {
    return this.frontBuffer;
  }

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------

  dispose(): void {
    this.disposed = true;
    void this.session?.release();
    this.session = null;
    this.ort = null;
    this.captureCanvas = null;
    this.captureCtx = null;
  }

  // -----------------------------------------------------------------------
  // Internal inference pipeline
  // -----------------------------------------------------------------------

  private async runInference(source: TextureImageSource): Promise<void> {
    try {
      if (!this.session || !this.captureCtx || !this.ort) return;

      // 1. Capture frame at model input size
      this.captureCtx.drawImage(
        source as CanvasImageSource,
        0, 0,
        MODEL_INPUT_SIZE, MODEL_INPUT_SIZE,
      );
      const imageData = this.captureCtx.getImageData(
        0, 0,
        MODEL_INPUT_SIZE, MODEL_INPUT_SIZE,
      );

      // 2. Pre-process: RGBA → normalised NCHW float32
      const inputTensor = this.preprocess(imageData);

      // 3. Run ONNX inference
      const results = await this.session.run({ [this.inputName]: inputTensor });
      const outputTensor = results[this.outputName];
      const depthFloat = outputTensor.data as Float32Array;

      // 4. Determine source dimensions from output tensor shape.
      //    Depth Anything v2 outputs [1, H, W] or [1, 1, H, W].
      const dims = outputTensor.dims;
      const srcH = dims.length === 3 ? dims[1] : dims[2];
      const srcW = dims.length === 3 ? dims[2] : dims[3];

      // 5. Post-process: bilinear resize + normalise + quantise → backBuffer
      this.postProcess(depthFloat, srcW, srcH);

      // 6. Swap buffers (front ↔ back)
      const temp = this.frontBuffer;
      this.frontBuffer = this.backBuffer;
      this.backBuffer = temp;
    } catch (err) {
      console.error('[DepthEstimator] Inference failed:', err);
    } finally {
      this.inferenceInFlight = false;
    }
  }

  /**
   * Convert RGBA ImageData → NCHW float32 tensor with ImageNet normalisation.
   */
  private preprocess(imageData: ImageData) {
    const { data, width, height } = imageData;
    const channelSize = width * height;
    const float32 = new Float32Array(3 * channelSize);

    for (let i = 0; i < channelSize; i++) {
      const rgbaIdx = i * 4;
      float32[i]                     = ((data[rgbaIdx]     / 255) - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      float32[channelSize + i]       = ((data[rgbaIdx + 1] / 255) - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
      float32[2 * channelSize + i]   = ((data[rgbaIdx + 2] / 255) - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    }

    return new this.ort!.Tensor('float32', float32, [1, 3, height, width]);
  }

  /**
   * Bilinear resize from model output dimensions → depth texture dimensions,
   * normalise to full [0, 255] range, and write into `backBuffer`.
   *
   * Depth Anything v2 (like v1) outputs inverse depth (disparity-like):
   * higher raw values = closer to camera. This matches the convention used
   * by the precompute pipeline (`normalizeToUint8` in scripts/precompute-depth.ts),
   * so no inversion is applied: 255 = nearest, 0 = farthest.
   */
  private postProcess(depthFloat: Float32Array, srcW: number, srcH: number): void {
    const { depthWidth, depthHeight } = this;

    // Find min/max for full-range normalisation
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < depthFloat.length; i++) {
      const v = depthFloat[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    const range = max - min || 1;
    const xRatio = srcW / depthWidth;
    const yRatio = srcH / depthHeight;

    for (let y = 0; y < depthHeight; y++) {
      for (let x = 0; x < depthWidth; x++) {
        // Bilinear interpolation
        const srcX = x * xRatio;
        const srcY = y * yRatio;
        const x0 = Math.floor(srcX);
        const y0 = Math.floor(srcY);
        const x1 = Math.min(x0 + 1, srcW - 1);
        const y1 = Math.min(y0 + 1, srcH - 1);
        const xFrac = srcX - x0;
        const yFrac = srcY - y0;

        const v00 = depthFloat[y0 * srcW + x0];
        const v01 = depthFloat[y0 * srcW + x1];
        const v10 = depthFloat[y1 * srcW + x0];
        const v11 = depthFloat[y1 * srcW + x1];

        const interpolated =
          v00 * (1 - xFrac) * (1 - yFrac) +
          v01 * xFrac * (1 - yFrac) +
          v10 * (1 - xFrac) * yFrac +
          v11 * xFrac * yFrac;

        // Normalise to [0, 1] — no inversion (DA v2 already outputs higher = closer)
        const normalised = (interpolated - min) / range;
        this.backBuffer[y * depthWidth + x] = (normalised * 255 + 0.5) | 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create and initialise a DepthEstimator.
 *
 * Returns a ready-to-use estimator. The front buffer starts as flat
 * mid-gray (128) so the renderer can start immediately while the first
 * real inference result arrives asynchronously.
 *
 * @param onProgress — Optional callback for download progress updates.
 */
export async function createDepthEstimator(
  modelUrl: string,
  depthWidth: number,
  depthHeight: number,
  onProgress?: OnModelProgress,
): Promise<DepthEstimator> {
  const estimator = new DepthEstimator(depthWidth, depthHeight);
  await estimator.init(modelUrl, onProgress);
  return estimator;
}

// ---------------------------------------------------------------------------
// Model download with progress
// ---------------------------------------------------------------------------

/**
 * Fetch the ONNX model binary with byte-level progress tracking.
 *
 * Uses `response.body.getReader()` to stream progress, then reassembles
 * the chunks into a single `ArrayBuffer` for `InferenceSession.create()`.
 */
async function fetchModelWithProgress(
  url: string,
  onProgress?: OnModelProgress,
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[DepthEstimator] Failed to fetch model (${response.status} ${response.statusText}).`);
  }

  const totalBytesHeader = response.headers.get('content-length');
  const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
  const body = response.body;

  // Fallback for browsers without ReadableStream support
  if (!body) {
    const buffer = await response.arrayBuffer();
    onProgress?.({
      receivedBytes: buffer.byteLength,
      totalBytes: buffer.byteLength,
      fraction: 1,
      label: 'Downloading depth model…',
    });
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;

    chunks.push(value);
    receivedBytes += value.byteLength;

    onProgress?.({
      receivedBytes,
      totalBytes,
      fraction: totalBytes ? Math.min(receivedBytes / totalBytes, 1) : 0,
      label: 'Downloading depth model…',
    });
  }

  // Reassemble into a single ArrayBuffer
  const result = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return result.buffer;
}
