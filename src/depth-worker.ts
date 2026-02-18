/**
 * Web Worker for depth frame processing.
 *
 * Offloads the expensive bilateral filter + frame interpolation + bilinear
 * resize from the main thread. The main thread posts a request with the
 * current playback time, and the worker responds with a processed Uint8Array
 * depth frame ready for GPU upload.
 *
 * ## Why a Worker?
 *
 * The bilateral filter (5×5 kernel on a 512×512 grid) takes ~5-15ms on the
 * main thread. During that time, the browser can't update the display or
 * process input events, causing visible video stutter ("chug"). By running
 * the filter in a Worker, the main thread stays free for rendering at a
 * smooth 60-120fps while depth processing happens in parallel.
 *
 * ## Protocol
 *
 * Main → Worker messages:
 *   { type: 'init', frames, meta, targetWidth, targetHeight }
 *   { type: 'sample', timeSec }
 *
 * Worker → Main messages:
 *   { type: 'ready' }
 *   { type: 'result', data: Uint8Array (transferred), timeSec }
 */

// ---------------------------------------------------------------------------
// Types for Worker messages
// ---------------------------------------------------------------------------

export interface DepthWorkerInitMessage {
  type: 'init';
  /** Raw frame data as ArrayBuffers (one per keyframe). */
  frames: ArrayBuffer[];
  meta: {
    frameCount: number;
    fps: number;
    width: number;
    height: number;
  };
  targetWidth: number;
  targetHeight: number;
}

export interface DepthWorkerSampleMessage {
  type: 'sample';
  timeSec: number;
}

export type DepthWorkerInMessage = DepthWorkerInitMessage | DepthWorkerSampleMessage;

export interface DepthWorkerReadyMessage {
  type: 'ready';
}

export interface DepthWorkerResultMessage {
  type: 'result';
  data: Uint8Array;
  timeSec: number;
}

export type DepthWorkerOutMessage = DepthWorkerReadyMessage | DepthWorkerResultMessage;

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

let frames: Uint8Array[] = [];
let meta = { frameCount: 0, fps: 0, width: 0, height: 0 };
let targetWidth = 0;
let targetHeight = 0;

// Pre-allocated buffers
let interpolatedDepth: Float32Array;
let bilateralOutput: Float32Array;
let resizedDepth: Float32Array;

// Frame-change caching (same logic as the main-thread version)
let lastFrameIndex = -1;
let lastNextFrameIndex = -1;
let lastLerpFactor = -1;
let cachedResult: Uint8Array | null = null;

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = (e: MessageEvent<DepthWorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    // Reconstitute Uint8Array frames from transferred ArrayBuffers
    frames = msg.frames.map((buf) => new Uint8Array(buf));
    meta = msg.meta;
    targetWidth = msg.targetWidth;
    targetHeight = msg.targetHeight;

    const sourceSize = meta.width * meta.height;
    const tgtSize = targetWidth * targetHeight;
    interpolatedDepth = new Float32Array(sourceSize);
    bilateralOutput = new Float32Array(sourceSize);
    resizedDepth = new Float32Array(tgtSize);

    // Reset cache
    lastFrameIndex = -1;
    lastNextFrameIndex = -1;
    lastLerpFactor = -1;
    cachedResult = null;

    (self as unknown as Worker).postMessage({ type: 'ready' } satisfies DepthWorkerReadyMessage);
    return;
  }

  if (msg.type === 'sample') {
    const result = sample(msg.timeSec);
    // Transfer the underlying ArrayBuffer for zero-copy
    (self as unknown as Worker).postMessage(
      { type: 'result', data: result, timeSec: msg.timeSec } satisfies DepthWorkerResultMessage,
      [result.buffer]
    );
    return;
  }
};

// ---------------------------------------------------------------------------
// Depth processing (mirrors DepthFrameInterpolator logic)
// ---------------------------------------------------------------------------

function sample(timeSec: number): Uint8Array {
  const depthTime = clamp(timeSec * meta.fps, 0, meta.frameCount - 1);
  const frameIndex = Math.floor(depthTime);
  const nextFrameIndex = Math.min(frameIndex + 1, meta.frameCount - 1);
  const lerpFactor = depthTime - frameIndex;

  // Check cache — return a copy if nothing changed
  const framesChanged = frameIndex !== lastFrameIndex || nextFrameIndex !== lastNextFrameIndex;
  const lerpChanged = Math.abs(lerpFactor - lastLerpFactor) > 0.001;
  if (!framesChanged && !lerpChanged && cachedResult) {
    // Must return a new buffer since we transfer ownership
    return new Uint8Array(cachedResult);
  }
  lastFrameIndex = frameIndex;
  lastNextFrameIndex = nextFrameIndex;
  lastLerpFactor = lerpFactor;

  // Interpolate between bracketing keyframes
  const inverse = 1 - lerpFactor;
  const depthA = frames[frameIndex];
  const depthB = frames[nextFrameIndex];
  for (let i = 0; i < interpolatedDepth.length; i += 1) {
    interpolatedDepth[i] = (depthA[i] * inverse + depthB[i] * lerpFactor) / 255;
  }

  // Bilateral filter
  bilateralFilterCPU(interpolatedDepth, meta.width, meta.height, bilateralOutput);

  // Resize if needed
  const needsResize = targetWidth !== meta.width || targetHeight !== meta.height;
  if (needsResize) {
    resizeDepthBilinear(
      bilateralOutput, meta.width, meta.height,
      targetWidth, targetHeight, resizedDepth
    );
  }

  // Convert Float32 [0,1] → Uint8 [0,255]
  const src = needsResize ? resizedDepth : bilateralOutput;
  const tgtSize = targetWidth * targetHeight;
  const uint8Result = new Uint8Array(tgtSize);
  for (let i = 0; i < tgtSize; i += 1) {
    uint8Result[i] = (src[i] * 255 + 0.5) | 0;
  }

  // Cache a copy for dedup on next call
  cachedResult = new Uint8Array(uint8Result);

  return uint8Result;
}

// ---------------------------------------------------------------------------
// Bilateral filter (identical to main-thread version)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Bilinear resize (identical to main-thread version)
// ---------------------------------------------------------------------------

function resizeDepthBilinear(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  tgtWidth: number,
  tgtHeight: number,
  out: Float32Array
): void {
  const xRatio = sourceWidth / tgtWidth;
  const yRatio = sourceHeight / tgtHeight;

  for (let y = 0; y < tgtHeight; y += 1) {
    const sourceY = (y + 0.5) * yRatio - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, sourceHeight - 1);
    const y1 = clamp(y0 + 1, 0, sourceHeight - 1);
    const yLerp = sourceY - y0;

    for (let x = 0; x < tgtWidth; x += 1) {
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
      out[y * tgtWidth + x] = top + (bottom - top) * yLerp;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
