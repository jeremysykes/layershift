/**
 * WebGPU Utilities — shared helpers for WebGPU renderers.
 *
 * Parallel to `webgl-utils.ts` but for the WebGPU backend.
 * Provides buffer creation, sampler factories, and fullscreen quad geometry.
 */

// ---------------------------------------------------------------------------
// Fullscreen quad
// ---------------------------------------------------------------------------

/** Fullscreen quad vertices: two triangles forming a quad in [-1, 1] NDC. */
const FULLSCREEN_QUAD_VERTICES = new Float32Array([
  -1, -1,
   1, -1,
  -1,  1,
   1,  1,
]);

/**
 * Create a GPU buffer containing a fullscreen quad (triangle strip, 4 vertices).
 */
export function createFullscreenQuadBuffer(device: GPUDevice): GPUBuffer {
  const buffer = device.createBuffer({
    size: FULLSCREEN_QUAD_VERTICES.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(FULLSCREEN_QUAD_VERTICES);
  buffer.unmap();
  return buffer;
}

// ---------------------------------------------------------------------------
// Buffer creation
// ---------------------------------------------------------------------------

/**
 * Create a GPU vertex buffer from Float32Array data.
 */
export function createVertexBuffer(device: GPUDevice, data: Float32Array): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

/**
 * Create a GPU index buffer from Uint16Array data.
 */
export function createIndexBuffer(device: GPUDevice, data: Uint16Array): GPUBuffer {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Uint16Array(buffer.getMappedRange()).set(data);
  buffer.unmap();
  return buffer;
}

/**
 * Create a GPU uniform buffer of the given byte size.
 */
export function createUniformBuffer(device: GPUDevice, byteSize: number): GPUBuffer {
  // Uniform buffers must be aligned to 16 bytes.
  const alignedSize = Math.ceil(byteSize / 16) * 16;
  return device.createBuffer({
    size: alignedSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
}

// ---------------------------------------------------------------------------
// Texture creation
// ---------------------------------------------------------------------------

/**
 * Create a 2D texture with common defaults for render targets.
 */
export function createRenderTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat = 'rgba8unorm'
): GPUTexture {
  return device.createTexture({
    size: [width, height],
    format,
    usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
  });
}

/**
 * Create a 2D texture for sampling (e.g., video frame, depth data).
 */
export function createSampleTexture(
  device: GPUDevice,
  width: number,
  height: number,
  format: GPUTextureFormat = 'rgba8unorm'
): GPUTexture {
  return device.createTexture({
    size: [width, height],
    format,
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
}

// ---------------------------------------------------------------------------
// Sampler factories
// ---------------------------------------------------------------------------

/** Create a linear-filtering, clamp-to-edge sampler. */
export function createLinearSampler(device: GPUDevice): GPUSampler {
  return device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
}

/** Create a nearest-filtering, clamp-to-edge sampler. */
export function createNearestSampler(device: GPUDevice): GPUSampler {
  return device.createSampler({
    magFilter: 'nearest',
    minFilter: 'nearest',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
}

// ---------------------------------------------------------------------------
// Image source import
// ---------------------------------------------------------------------------

/**
 * Import a CanvasImageSource into a WebGPU texture via `copyExternalImageToTexture`.
 *
 * Accepts HTMLVideoElement, HTMLImageElement, HTMLCanvasElement, or
 * ImageBitmap — any source supported by the WebGPU copy API. On
 * supported browsers the video path is a zero-copy operation.
 */
export function importImageSource(
  device: GPUDevice,
  texture: GPUTexture,
  source: GPUCopyExternalImageSource,
  width: number,
  height: number,
  flipY = true,
): void {
  device.queue.copyExternalImageToTexture(
    { source, flipY },
    { texture },
    [width, height],
  );
}

