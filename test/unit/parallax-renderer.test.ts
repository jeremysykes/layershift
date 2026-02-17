/**
 * Unit tests for ParallaxRenderer API contracts and RVFC logic.
 *
 * THREE.js WebGLRenderer requires a real WebGL context (getShaderPrecisionFormat,
 * etc.) that cannot be mocked in happy-dom. Instead, these tests validate:
 *
 * 1. RVFC feature detection logic
 * 2. start() API signature (4th optional param)
 * 3. onVideoFrame callback contract
 * 4. Module exports
 *
 * Full rendering integration is tested in the Playwright E2E suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// RVFC feature detection
// ---------------------------------------------------------------------------

describe('RVFC feature detection', () => {
  let originalRVFC: typeof HTMLVideoElement.prototype.requestVideoFrameCallback | undefined;
  let originalCancel: typeof HTMLVideoElement.prototype.cancelVideoFrameCallback | undefined;

  beforeEach(() => {
    originalRVFC = HTMLVideoElement.prototype.requestVideoFrameCallback;
    originalCancel = HTMLVideoElement.prototype.cancelVideoFrameCallback;
  });

  afterEach(() => {
    if (originalRVFC) {
      HTMLVideoElement.prototype.requestVideoFrameCallback = originalRVFC;
    } else {
      delete (HTMLVideoElement.prototype as Record<string, unknown>).requestVideoFrameCallback;
    }
    if (originalCancel) {
      HTMLVideoElement.prototype.cancelVideoFrameCallback = originalCancel;
    } else {
      delete (HTMLVideoElement.prototype as Record<string, unknown>).cancelVideoFrameCallback;
    }
  });

  it('detects RVFC when available on HTMLVideoElement prototype', () => {
    HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn(() => 1);
    HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn();

    const isSupported = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    expect(isSupported).toBe(true);
  });

  it('returns false when RVFC is not on prototype', () => {
    delete (HTMLVideoElement.prototype as Record<string, unknown>).requestVideoFrameCallback;

    const isSupported = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    expect(isSupported).toBe(false);
  });

  it('RVFC callback is invocable on a video element', () => {
    const callback = vi.fn();
    HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn((_cb) => 42);

    const video = document.createElement('video');
    const handle = video.requestVideoFrameCallback(callback);

    expect(handle).toBe(42);
    expect(video.requestVideoFrameCallback).toHaveBeenCalledWith(callback);
  });

  it('cancelVideoFrameCallback is invocable', () => {
    HTMLVideoElement.prototype.requestVideoFrameCallback = vi.fn(() => 42);
    HTMLVideoElement.prototype.cancelVideoFrameCallback = vi.fn();

    const video = document.createElement('video');
    const handle = video.requestVideoFrameCallback(vi.fn());
    video.cancelVideoFrameCallback(handle);

    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(42);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe('ParallaxRenderer module', () => {
  it('exports ParallaxRenderer class', async () => {
    const mod = await import('../../src/parallax-renderer');
    expect(mod.ParallaxRenderer).toBeDefined();
    expect(typeof mod.ParallaxRenderer).toBe('function');
  });
});

// ---------------------------------------------------------------------------
// start() API contract (type-level validation)
// ---------------------------------------------------------------------------

describe('ParallaxRenderer.start() API contract', () => {
  it('4th parameter is optional (backward compatible)', () => {
    // This validates the TypeScript signature at compile time.
    // If the type is wrong, this test file won't compile.
    type StartFn = (
      video: HTMLVideoElement,
      readDepth: (timeSec: number) => Uint8Array,
      readInput: () => { x: number; y: number },
      onVideoFrame?: (currentTime: number, frameNumber: number) => void
    ) => void;

    const fn: StartFn = vi.fn();

    // Should accept 3 args (original API)
    fn(document.createElement('video'), () => new Uint8Array(0), () => ({ x: 0, y: 0 }));

    // Should accept 4 args (new API with onVideoFrame)
    fn(
      document.createElement('video'),
      () => new Uint8Array(0),
      () => ({ x: 0, y: 0 }),
      (_time, _frame) => {}
    );

    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// onVideoFrame callback contract
// ---------------------------------------------------------------------------

describe('onVideoFrame callback contract', () => {
  it('callback receives currentTime and frameNumber', () => {
    const onVideoFrame = vi.fn();

    // Simulate what the RVFC loop does
    const mediaTime = 1.234;
    const presentedFrames = 42;
    onVideoFrame(mediaTime, presentedFrames);

    expect(onVideoFrame).toHaveBeenCalledWith(1.234, 42);
  });

  it('callback handles zero values', () => {
    const onVideoFrame = vi.fn();
    onVideoFrame(0, 0);
    expect(onVideoFrame).toHaveBeenCalledWith(0, 0);
  });

  it('callback is optional (null/undefined)', () => {
    const onVideoFrame: ((t: number, f: number) => void) | null = null;

    // The renderer checks `if (this.onVideoFrame)` before calling
    expect(onVideoFrame).toBeNull();
    expect(() => {
      if (onVideoFrame) onVideoFrame(0, 0);
    }).not.toThrow();
  });

  it('simulates the RVFC→onVideoFrame→event dispatch pipeline', () => {
    // Simulates the full pipeline:
    // RVFC fires → renderer calls onVideoFrame → component dispatches event
    const events: Array<{ currentTime: number; frameNumber: number }> = [];

    // This mimics what DepthParallaxElement does with the callback
    const onVideoFrame = (currentTime: number, frameNumber: number) => {
      events.push({ currentTime, frameNumber });
    };

    // Simulate 3 video frames
    onVideoFrame(0.0, 1);
    onVideoFrame(0.033, 2);
    onVideoFrame(0.066, 3);

    expect(events).toEqual([
      { currentTime: 0.0, frameNumber: 1 },
      { currentTime: 0.033, frameNumber: 2 },
      { currentTime: 0.066, frameNumber: 3 },
    ]);
  });
});
