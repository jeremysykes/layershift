export interface DepthMeta {
  frameCount: number;
  fps: number;
  width: number;
  height: number;
  sourceFps: number;
}

export interface PrecomputedDepthData {
  meta: DepthMeta;
  frames: Uint8Array[];
}

export interface BinaryDownloadProgress {
  receivedBytes: number;
  totalBytes: number | null;
  fraction: number;
}

/**
 * Worker-backed depth frame interpolator.
 *
 * Offloads the bilateral filter, interpolation, and resize to a Web Worker
 * so the main thread stays free for smooth rendering. Uses double-buffering:
 * the main thread always has a ready-to-use depth frame while the worker
 * computes the next one in parallel.
 *
 * ## Double-buffer strategy
 *
 * - `currentBuffer` — the latest completed depth frame, always available
 *   for synchronous reads via `sample()`.
 * - When the render loop calls `sample(timeSec)`, it returns `currentBuffer`
 *   immediately (zero main-thread work) and posts a request to the worker
 *   for the new time if it differs from the last requested time.
 * - When the worker responds, `currentBuffer` is swapped to the new result.
 * - During the 1-2 frames of latency, the previous depth frame is shown —
 *   this is imperceptible since depth only changes at ~5fps.
 */
export class WorkerDepthInterpolator {
  private worker: Worker;
  private currentBuffer: Uint8Array;
  private pendingTimeSec: number | null = null;
  private workerBusy = false;
  private disposed = false;

  private constructor(
    worker: Worker,
    bufferSize: number,
  ) {
    this.worker = worker;
    this.currentBuffer = new Uint8Array(bufferSize);
  }

  /**
   * Create a WorkerDepthInterpolator, initializing the worker with frame data.
   *
   * The frame ArrayBuffers are transferred (zero-copy) to the worker.
   * After this call, the original depthData.frames arrays are neutered
   * and should not be accessed.
   */
  static async create(
    depthData: PrecomputedDepthData,
    targetWidth: number,
    targetHeight: number
  ): Promise<WorkerDepthInterpolator> {
    const worker = new Worker(
      new URL('./depth-worker.ts', import.meta.url),
      { type: 'module' }
    );

    const bufferSize = targetWidth * targetHeight;
    const instance = new WorkerDepthInterpolator(worker, bufferSize);

    // Copy frame data into standalone ArrayBuffers for transfer.
    // The original frames are subarrays of a single large buffer,
    // so we can't transfer them directly.
    const frameBuffers: ArrayBuffer[] = depthData.frames.map((frame) => {
      const copy = new Uint8Array(frame.length);
      copy.set(frame);
      return copy.buffer;
    });

    // Send init message with transferred buffers (zero-copy).
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Worker init timeout')), 10_000);

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === 'ready') {
          clearTimeout(timeout);
          resolve();
        }
      };
      worker.onerror = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      worker.postMessage(
        {
          type: 'init',
          frames: frameBuffers,
          meta: {
            frameCount: depthData.meta.frameCount,
            fps: depthData.meta.fps,
            width: depthData.meta.width,
            height: depthData.meta.height,
          },
          targetWidth,
          targetHeight,
        },
        frameBuffers  // Transfer list
      );
    });

    // Set up the result handler
    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'result') {
        instance.currentBuffer = e.data.data;
        instance.workerBusy = false;

        // If a newer time was requested while the worker was busy,
        // immediately send the latest request.
        if (instance.pendingTimeSec !== null) {
          const nextTime = instance.pendingTimeSec;
          instance.pendingTimeSec = null;
          instance.requestSample(nextTime);
        }
      }
    };

    return instance;
  }

  /**
   * Get the current depth frame — always synchronous, zero main-thread work.
   *
   * Returns the latest completed depth frame from the worker. If the worker
   * hasn't finished processing the current time yet, returns the previous
   * frame (1-2 frame latency is imperceptible at ~5fps depth changes).
   *
   * Automatically requests the worker to process the new time in the background.
   */
  sample(timeSec: number): Uint8Array {
    this.requestSample(timeSec);
    return this.currentBuffer;
  }

  /** Send a sample request to the worker if it's not busy. */
  private requestSample(timeSec: number): void {
    if (this.disposed) return;

    if (this.workerBusy) {
      // Worker is processing — queue the latest time for when it's done
      this.pendingTimeSec = timeSec;
      return;
    }

    this.workerBusy = true;
    this.worker.postMessage({ type: 'sample', timeSec });
  }

  /** Terminate the worker and release resources. */
  dispose(): void {
    this.disposed = true;
    this.worker.terminate();
  }
}

export class DepthFrameInterpolator {
  private readonly interpolatedDepth: Float32Array;
  private readonly resizedDepth: Float32Array;
  private readonly bilateralOutput: Float32Array;
  private readonly uint8Output: Uint8Array;

  // Frame-change detection to skip redundant computation.
  // Depth only changes at ~5fps (keyframe interpolation), but the
  // render loop calls sample() at 60fps. Caching avoids recomputing
  // the bilateral filter + Uint8 conversion for ~12 identical frames.
  private lastFrameIndex = -1;
  private lastNextFrameIndex = -1;
  private lastLerpFactor = -1;

  constructor(
    private readonly depthData: PrecomputedDepthData,
    private readonly targetWidth: number,
    private readonly targetHeight: number
  ) {
    const sourceSize = depthData.meta.width * depthData.meta.height;
    const targetSize = targetWidth * targetHeight;
    this.interpolatedDepth = new Float32Array(sourceSize);
    this.bilateralOutput = new Float32Array(sourceSize);
    this.resizedDepth = new Float32Array(targetSize);
    this.uint8Output = new Uint8Array(targetSize);
  }

  sample(timeSec: number): Uint8Array {
    const depthTime = clamp(timeSec * this.depthData.meta.fps, 0, this.depthData.meta.frameCount - 1);
    const frameIndex = Math.floor(depthTime);
    const nextFrameIndex = Math.min(frameIndex + 1, this.depthData.meta.frameCount - 1);
    const lerpFactor = depthTime - frameIndex;

    // Return cached result if nothing meaningful changed.
    const framesChanged = frameIndex !== this.lastFrameIndex || nextFrameIndex !== this.lastNextFrameIndex;
    const lerpChanged = Math.abs(lerpFactor - this.lastLerpFactor) > 0.001;
    if (!framesChanged && !lerpChanged) {
      return this.uint8Output;
    }
    this.lastFrameIndex = frameIndex;
    this.lastNextFrameIndex = nextFrameIndex;
    this.lastLerpFactor = lerpFactor;

    // Interpolate between the two bracketing keyframes.
    const inverse = 1 - lerpFactor;
    const depthA = this.depthData.frames[frameIndex];
    const depthB = this.depthData.frames[nextFrameIndex];
    for (let i = 0; i < this.interpolatedDepth.length; i += 1) {
      this.interpolatedDepth[i] = (depthA[i] * inverse + depthB[i] * lerpFactor) / 255;
    }

    // Apply bilateral filter — preserves sharp depth edges while
    // smoothing noise. Same parameters as the old GPU-side filter
    // (spatial σ=1.5, depth σ=0.1, 5x5 kernel) but executed once
    // per depth frame change (~5fps) instead of per-pixel per-frame.
    bilateralFilterCPU(
      this.interpolatedDepth,
      this.depthData.meta.width,
      this.depthData.meta.height,
      this.bilateralOutput
    );

    // Resize if target dimensions differ from source.
    const needsResize =
      this.targetWidth !== this.depthData.meta.width ||
      this.targetHeight !== this.depthData.meta.height;

    if (needsResize) {
      resizeDepthBilinear(
        this.bilateralOutput,
        this.depthData.meta.width,
        this.depthData.meta.height,
        this.targetWidth,
        this.targetHeight,
        this.resizedDepth
      );
    }

    // Convert Float32 [0,1] to Uint8 [0,255] for GPU upload.
    // Uint8 is 4x smaller than Float32 (1MB vs 4MB at 1024x1024)
    // and 256 depth levels provides sub-pixel precision for the
    // 5% max UV displacement.
    const src = needsResize ? this.resizedDepth : this.bilateralOutput;
    for (let i = 0; i < this.uint8Output.length; i += 1) {
      this.uint8Output[i] = (src[i] * 255 + 0.5) | 0;
    }

    return this.uint8Output;
  }
}

export async function loadPrecomputedDepth(
  depthDataUrl: string,
  depthMetaUrl: string,
  onProgress?: (progress: BinaryDownloadProgress) => void
): Promise<PrecomputedDepthData> {
  const [meta, packedDepthData] = await Promise.all([
    fetchDepthMeta(depthMetaUrl),
    fetchBinaryWithProgress(depthDataUrl, onProgress),
  ]);

  return parsePackedDepthData(packedDepthData, meta);
}

async function fetchDepthMeta(url: string): Promise<DepthMeta> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch depth metadata (${response.status} ${response.statusText}).`);
  }

  const json = (await response.json()) as Partial<DepthMeta>;
  validateDepthMeta(json);

  return {
    frameCount: json.frameCount as number,
    fps: json.fps as number,
    width: json.width as number,
    height: json.height as number,
    sourceFps: json.sourceFps as number,
  };
}

async function fetchBinaryWithProgress(
  url: string,
  onProgress?: (progress: BinaryDownloadProgress) => void
): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch depth data (${response.status} ${response.statusText}).`);
  }

  const totalBytesHeader = response.headers.get('content-length');
  const totalBytes = totalBytesHeader ? Number(totalBytesHeader) : null;
  const body = response.body;

  if (!body) {
    const buffer = new Uint8Array(await response.arrayBuffer());
    onProgress?.({
      receivedBytes: buffer.byteLength,
      totalBytes,
      fraction: 1,
    });
    return buffer;
  }

  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  const reader = body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    if (!value) {
      continue;
    }

    chunks.push(value);
    receivedBytes += value.byteLength;
    onProgress?.({
      receivedBytes,
      totalBytes,
      fraction: totalBytes ? clamp(receivedBytes / totalBytes, 0, 1) : 0,
    });
  }

  const binary = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    binary.set(chunk, offset);
    offset += chunk.byteLength;
  }

  onProgress?.({
    receivedBytes,
    totalBytes,
    fraction: 1,
  });

  return binary;
}

function parsePackedDepthData(binary: Uint8Array, meta: DepthMeta): PrecomputedDepthData {
  if (binary.byteLength < 4) {
    throw new Error('Depth data binary is missing the frame-count header.');
  }

  const view = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const frameCountFromHeader = view.getUint32(0, true);
  const frameSize = meta.width * meta.height;
  const expectedByteLength = 4 + frameCountFromHeader * frameSize;

  if (binary.byteLength !== expectedByteLength) {
    throw new Error(
      `Depth data byte length mismatch. Expected ${expectedByteLength} bytes, received ${binary.byteLength}.`
    );
  }

  if (frameCountFromHeader !== meta.frameCount) {
    throw new Error(
      `Depth frame count mismatch between metadata (${meta.frameCount}) and binary header (${frameCountFromHeader}).`
    );
  }

  const payload = binary.subarray(4);
  const frames: Uint8Array[] = new Array(frameCountFromHeader);
  for (let index = 0; index < frameCountFromHeader; index += 1) {
    const start = index * frameSize;
    frames[index] = payload.subarray(start, start + frameSize);
  }

  return { meta, frames };
}

function validateDepthMeta(meta: Partial<DepthMeta>): void {
  if (
    !meta ||
    typeof meta.frameCount !== 'number' ||
    typeof meta.fps !== 'number' ||
    typeof meta.width !== 'number' ||
    typeof meta.height !== 'number' ||
    typeof meta.sourceFps !== 'number'
  ) {
    throw new Error('Depth metadata is malformed.');
  }

  if (
    !Number.isFinite(meta.frameCount) ||
    !Number.isFinite(meta.fps) ||
    !Number.isFinite(meta.width) ||
    !Number.isFinite(meta.height) ||
    !Number.isFinite(meta.sourceFps) ||
    meta.frameCount <= 0 ||
    meta.fps <= 0 ||
    meta.width <= 0 ||
    meta.height <= 0 ||
    meta.sourceFps <= 0
  ) {
    throw new Error('Depth metadata contains invalid numeric values.');
  }
}

function resizeDepthBilinear(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  out: Float32Array
): void {
  const xRatio = sourceWidth / targetWidth;
  const yRatio = sourceHeight / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = (y + 0.5) * yRatio - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, sourceHeight - 1);
    const y1 = clamp(y0 + 1, 0, sourceHeight - 1);
    const yLerp = sourceY - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = (x + 0.5) * xRatio - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, sourceWidth - 1);
      const x1 = clamp(x0 + 1, 0, sourceWidth - 1);
      const xLerp = sourceX - x0;

      const topLeft = source[y0 * sourceWidth + x0];
      const topRight = source[y0 * sourceWidth + x1];
      const bottomLeft = source[y1 * sourceWidth + x0];
      const bottomRight = source[y1 * sourceWidth + x1];

      const top = topLeft + (topRight - topLeft) * xLerp;
      const bottom = bottomLeft + (bottomRight - bottomLeft) * xLerp;
      out[y * targetWidth + x] = top + (bottom - top) * yLerp;
    }
  }
}

/**
 * 5x5 bilateral filter — edge-preserving depth smoothing.
 *
 * Weights each neighbor by both spatial distance and depth similarity
 * to the center pixel. Sharp depth boundaries (e.g., a silhouette
 * against the sky) are preserved because dissimilar-depth neighbors
 * receive near-zero weight. Smooth regions still get denoised.
 *
 * Parameters match the old GPU-side GLSL filter exactly:
 * - Spatial sigma = 1.5 texels (Gaussian falloff with distance)
 * - Depth sigma = 0.1 (normalized 0-1, controls edge sensitivity)
 *
 * Runs on the CPU at depth-frame rate (~5fps during keyframe
 * transitions). At 1024x1024 this takes ~15-30ms — well within the
 * 200ms budget per depth frame.
 */
function bilateralFilterCPU(
  source: Float32Array,
  width: number,
  height: number,
  out: Float32Array
): void {
  const spatialSigma2 = 2.25;  // 1.5^2
  const depthSigma2 = 0.01;    // 0.1^2

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const center = source[idx];
      let totalWeight = 1.0;
      let totalDepth = center;

      for (let dy = -2; dy <= 2; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;

          const neighbor = source[ny * width + nx];
          const spatialDist2 = dx * dx + dy * dy;
          const depthDiff = neighbor - center;
          const w = Math.exp(-spatialDist2 / spatialSigma2 - (depthDiff * depthDiff) / depthSigma2);

          totalWeight += w;
          totalDepth += neighbor * w;
        }
      }

      out[idx] = totalDepth / totalWeight;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
