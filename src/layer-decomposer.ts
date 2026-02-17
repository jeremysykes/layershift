export interface LayerTextureSet {
  index: number;
  timeSec: number;
  width: number;
  height: number;
  layers: Uint8Array[];
}

export interface LayerDecompositionOptions {
  layerCount: number;
  featherRadiusPx: number;
  invertDepth?: boolean;
}

export function decomposeFrameToLayers(
  frame: ImageData,
  depthMap: Float32Array,
  index: number,
  timeSec: number,
  options: LayerDecompositionOptions
): LayerTextureSet {
  const { width, height, data: sourceRgba } = frame;
  const pixelCount = width * height;

  if (depthMap.length !== pixelCount) {
    throw new Error(
      `Depth map size (${depthMap.length}) does not match frame (${pixelCount}).`
    );
  }

  const masks = Array.from({ length: options.layerCount }, () => new Uint8Array(pixelCount));

  for (let i = 0; i < pixelCount; i += 1) {
    const depth = clamp(options.invertDepth ? 1 - depthMap[i] : depthMap[i], 0, 1);
    const layerIndex = Math.min(options.layerCount - 1, Math.floor(depth * options.layerCount));
    masks[layerIndex][i] = 255;
  }

  const featheredMasks = masks.map((mask) =>
    blurMask(mask, width, height, options.featherRadiusPx)
  );

  normalizeOverlappingAlpha(featheredMasks, pixelCount);

  const layers: Uint8Array[] = [];
  for (let layerIndex = 0; layerIndex < options.layerCount; layerIndex += 1) {
    const alphaMask = featheredMasks[layerIndex];
    const rgba = new Uint8Array(pixelCount * 4);

    for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
      const alpha = alphaMask[pixelIndex];
      const sourceOffset = pixelIndex * 4;
      const targetOffset = sourceOffset;

      if (alpha > 0) {
        // Premultiply RGB by alpha so the renderer can use
        // ONE / ONE_MINUS_SRC_ALPHA blending, which avoids dark
        // halos at semi-transparent layer boundaries.
        const a = alpha / 255;
        rgba[targetOffset] = Math.round(sourceRgba[sourceOffset] * a);
        rgba[targetOffset + 1] = Math.round(sourceRgba[sourceOffset + 1] * a);
        rgba[targetOffset + 2] = Math.round(sourceRgba[sourceOffset + 2] * a);
      } else {
        rgba[targetOffset] = 0;
        rgba[targetOffset + 1] = 0;
        rgba[targetOffset + 2] = 0;
      }

      rgba[targetOffset + 3] = alpha;
    }

    layers.push(rgba);
  }

  return {
    index,
    timeSec,
    width,
    height,
    layers,
  };
}

function blurMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) {
    return mask;
  }

  const tmp = new Float32Array(mask.length);
  const out = new Uint8Array(mask.length);
  const kernelSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleX = clamp(x + k, 0, width - 1);
        sum += mask[y * width + sampleX];
      }
      tmp[y * width + x] = sum / kernelSize;
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let k = -radius; k <= radius; k += 1) {
        const sampleY = clamp(y + k, 0, height - 1);
        sum += tmp[sampleY * width + x];
      }
      out[y * width + x] = Math.round(sum / kernelSize);
    }
  }

  return out;
}

function normalizeOverlappingAlpha(masks: Uint8Array[], pixelCount: number): void {
  for (let pixelIndex = 0; pixelIndex < pixelCount; pixelIndex += 1) {
    let sum = 0;
    for (let layerIndex = 0; layerIndex < masks.length; layerIndex += 1) {
      sum += masks[layerIndex][pixelIndex];
    }

    if (sum === 0 || sum === 255) {
      continue;
    }

    // Scale alpha values so they sum to exactly 255.  Use floor + remainder
    // distribution to avoid rounding errors that leave partial transparency
    // (which bleeds the black clear-color through as dark bands).
    const scale = 255 / sum;
    let roundedSum = 0;
    let maxIndex = 0;
    let maxValue = 0;

    for (let layerIndex = 0; layerIndex < masks.length; layerIndex += 1) {
      const scaled = Math.floor(masks[layerIndex][pixelIndex] * scale);
      masks[layerIndex][pixelIndex] = scaled;
      roundedSum += scaled;
      if (scaled >= maxValue) {
        maxValue = scaled;
        maxIndex = layerIndex;
      }
    }

    // Assign any remainder to the dominant layer so the total is always 255.
    const remainder = 255 - roundedSum;
    if (remainder > 0) {
      masks[maxIndex][pixelIndex] = Math.min(255, masks[maxIndex][pixelIndex] + remainder);
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
