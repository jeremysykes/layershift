/**
 * Site-wide constants for the Layershift landing page.
 */

/**
 * URL to the ONNX depth estimation model served from public/.
 *
 * Depth Anything v2 Small (q4f16 quantized, ~19MB).
 * Used by camera mode and image sources that lack precomputed depth data.
 *
 * @see ADR-014 for the depth estimation architecture.
 * @see ADR-015 for the model variant selection rationale.
 */
export const DEPTH_MODEL_URL = '/models/depth-anything-v2-small-q4f16.onnx';
