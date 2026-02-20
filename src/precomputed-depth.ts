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
 * Depth frame interpolator — synchronous keyframe blending.
 *
 * Interpolates between precomputed depth keyframes at ~5fps and returns
 * raw Uint8 depth data for GPU upload. The bilateral filter runs on the
 * GPU as a dedicated shader pass (see parallax-renderer.ts), so this
 * class only handles temporal interpolation.
 *
 * Frame-change caching avoids redundant computation: depth only changes
 * at ~5fps (keyframe transitions), but the render loop calls sample()
 * at 60fps. Caching skips recomputation for ~12 identical frames.
 */
export class DepthFrameInterpolator {
  private readonly uint8Output: Uint8Array;

  // Frame-change detection to skip redundant computation.
  private lastFrameIndex = -1;
  private lastNextFrameIndex = -1;
  private lastLerpFactor = -1;

  constructor(
    private readonly depthData: PrecomputedDepthData,
  ) {
    const size = depthData.meta.width * depthData.meta.height;
    this.uint8Output = new Uint8Array(size);
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
    // Stays in Uint8 domain — the GPU bilateral filter operates on
    // normalized [0,1] values via the R8 texture format.
    const inverse = 1 - lerpFactor;
    const depthA = this.depthData.frames[frameIndex];
    const depthB = this.depthData.frames[nextFrameIndex];
    for (let i = 0; i < this.uint8Output.length; i += 1) {
      this.uint8Output[i] = (depthA[i] * inverse + depthB[i] * lerpFactor + 0.5) | 0;
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
