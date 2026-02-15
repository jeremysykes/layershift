import { RawImage, env, pipeline } from '@xenova/transformers';

export interface DepthEngineProgress {
  status?: string;
  file?: string;
  progress?: number;
}

type DepthEstimator = Awaited<ReturnType<typeof pipeline<'depth-estimation'>>>;

export class DepthEngine {
  private estimator: DepthEstimator | null = null;

  constructor(private readonly modelId: string) {
    env.allowLocalModels = false;
    env.useBrowserCache = true;
  }

  async init(onProgress?: (progress: DepthEngineProgress) => void): Promise<void> {
    this.estimator = await pipeline('depth-estimation', this.modelId, {
      progress_callback: (progress: unknown) => {
        if (!onProgress || typeof progress !== 'object' || progress === null) {
          return;
        }

        onProgress(progress as DepthEngineProgress);
      },
    });
  }

  async estimateDepth(
    frame: ImageData,
    targetWidth: number,
    targetHeight: number
  ): Promise<Float32Array> {
    if (!this.estimator) {
      throw new Error('Depth engine was used before calling init().');
    }

    const rawImage = new RawImage(frame.data, frame.width, frame.height, 4);
    const output = (await this.estimator(rawImage)) as {
      predicted_depth?: { data: Float32Array; dims: number[] };
      depth?: { data: ArrayLike<number>; width: number; height: number };
    };

    const depthSource = this.extractDepthSource(output);
    const normalizedDepth = normalizeToUnitRange(depthSource.data);

    if (depthSource.width === targetWidth && depthSource.height === targetHeight) {
      return normalizedDepth;
    }

    return resizeDepthBilinear(
      normalizedDepth,
      depthSource.width,
      depthSource.height,
      targetWidth,
      targetHeight
    );
  }

  private extractDepthSource(output: {
    predicted_depth?: { data: Float32Array; dims: number[] };
    depth?: { data: ArrayLike<number>; width: number; height: number };
  }): { data: Float32Array; width: number; height: number } {
    if (
      output.predicted_depth &&
      Array.isArray(output.predicted_depth.dims) &&
      output.predicted_depth.dims.length === 2
    ) {
      const [height, width] = output.predicted_depth.dims;
      return {
        data: output.predicted_depth.data,
        width,
        height,
      };
    }

    if (output.depth) {
      const source = output.depth;
      const data = new Float32Array(source.width * source.height);
      const stride = source.data.length / data.length;

      for (let i = 0; i < data.length; i += 1) {
        data[i] = source.data[Math.floor(i * stride)] ?? 0;
      }

      return {
        data,
        width: source.width,
        height: source.height,
      };
    }

    throw new Error('Depth model returned an unexpected output shape.');
  }
}

function normalizeToUnitRange(source: Float32Array): Float32Array {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < source.length; i += 1) {
    const value = source[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min || 1;
  const out = new Float32Array(source.length);

  for (let i = 0; i < source.length; i += 1) {
    out[i] = (source[i] - min) / range;
  }

  return out;
}

function resizeDepthBilinear(
  source: Float32Array,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number
): Float32Array {
  const out = new Float32Array(targetWidth * targetHeight);

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

  return out;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
