/**
 * Unit tests for the precomputed depth interpolation system.
 *
 * Tests the DepthFrameInterpolator (frame-change caching, interpolation,
 * Uint8 output) and the depth data loading utilities.
 */

import { describe, it, expect } from 'vitest';
import {
  DepthFrameInterpolator,
  type PrecomputedDepthData,
  type DepthMeta,
} from '../../src/precomputed-depth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal depth data fixture with uniform frames. */
function createDepthData(
  frameCount: number,
  width: number,
  height: number,
  fps: number,
  fillFn?: (frameIndex: number, pixelIndex: number) => number
): PrecomputedDepthData {
  const meta: DepthMeta = { frameCount, fps, width, height, sourceFps: 30 };
  const frameSize = width * height;
  const frames: Uint8Array[] = [];

  for (let f = 0; f < frameCount; f++) {
    const frame = new Uint8Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
      frame[i] = fillFn ? fillFn(f, i) : 128;
    }
    frames.push(frame);
  }

  return { meta, frames };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DepthFrameInterpolator', () => {
  it('returns a Uint8Array of the correct size', () => {
    const data = createDepthData(10, 8, 8, 5);
    const interp = new DepthFrameInterpolator(data, 8, 8);
    const result = interp.sample(0);

    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(64); // 8 * 8
  });

  it('returns consistent output for the same time', () => {
    const data = createDepthData(10, 4, 4, 5);
    const interp = new DepthFrameInterpolator(data, 4, 4);

    const a = interp.sample(0.5);
    const b = interp.sample(0.5);

    // Should be the exact same buffer reference (cached)
    expect(a).toBe(b);
  });

  it('returns cached result when depth frame has not changed', () => {
    const data = createDepthData(10, 4, 4, 5);
    const interp = new DepthFrameInterpolator(data, 4, 4);

    const a = interp.sample(0.0);
    const b = interp.sample(0.0001); // Tiny time change, same frame

    // Should be the same buffer reference (frame-change cache hit)
    expect(a).toBe(b);
  });

  it('produces different output for different depth frames', () => {
    // Frame 0 = all 0 (near), Frame 1 = all 255 (far)
    const data = createDepthData(2, 4, 4, 1, (f) => f * 255);
    const interp = new DepthFrameInterpolator(data, 4, 4);

    const atStart = interp.sample(0.0);
    const startValues = Array.from(atStart);

    const atEnd = interp.sample(1.0);
    const endValues = Array.from(atEnd);

    // At time=0, depth should reflect frame 0 (near)
    // At time=1, depth should reflect frame 1 (far)
    // They must differ because the underlying frames differ
    expect(startValues).not.toEqual(endValues);
  });

  it('interpolates between keyframes', () => {
    // Frame 0 = all 0, Frame 1 = all 255
    const data = createDepthData(2, 2, 2, 1, (f) => f * 255);
    const interp = new DepthFrameInterpolator(data, 2, 2);

    // At midpoint (t=0.5), the raw interpolation would be ~127.5
    // After bilateral filter and Uint8 conversion, should be ~128
    const mid = interp.sample(0.5);
    const midAvg = mid.reduce((a, b) => a + b, 0) / mid.length;

    // Should be roughly in the middle (allow for bilateral filter effects)
    expect(midAvg).toBeGreaterThan(80);
    expect(midAvg).toBeLessThan(180);
  });

  it('clamps time to valid range', () => {
    const data = createDepthData(5, 4, 4, 5);
    const interp = new DepthFrameInterpolator(data, 4, 4);

    // Negative time should not throw
    expect(() => interp.sample(-1)).not.toThrow();

    // Time beyond video duration should not throw
    expect(() => interp.sample(100)).not.toThrow();
  });

  it('handles single-frame depth data', () => {
    const data = createDepthData(1, 4, 4, 5, () => 200);
    const interp = new DepthFrameInterpolator(data, 4, 4);

    const result = interp.sample(0);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(16);
  });

  it('handles resize when target differs from source', () => {
    const data = createDepthData(2, 8, 8, 5, () => 128);
    // Target is smaller than source — triggers bilinear resize
    const interp = new DepthFrameInterpolator(data, 4, 4);

    const result = interp.sample(0);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBe(16); // 4 * 4
  });

  it('output values are in [0, 255] range', () => {
    const data = createDepthData(3, 4, 4, 5, (f, i) => (f * 50 + i * 10) % 256);
    const interp = new DepthFrameInterpolator(data, 4, 4);

    for (let t = 0; t < 3; t += 0.3) {
      const result = interp.sample(t);
      for (let i = 0; i < result.length; i++) {
        expect(result[i]).toBeGreaterThanOrEqual(0);
        expect(result[i]).toBeLessThanOrEqual(255);
      }
    }
  });
});
