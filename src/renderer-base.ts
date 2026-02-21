/**
 * Abstract base class for Layershift renderers.
 *
 * Extracts shared non-GPU logic common to both the parallax and portal
 * renderers (and their future WebGPU counterparts):
 *
 * - Canvas creation + container attachment
 * - Dual-loop animation management (RVFC + RAF)
 * - Resize handling with debounce
 * - Depth dimension clamping + CPU subsampling
 * - Cover-fit UV computation
 * - WebGL context loss handling
 *
 * Subclasses implement the GPU-specific abstract methods:
 * `onRenderFrame()`, `onDepthUpdate()`, `recalculateViewportLayout()`,
 * `disposeRenderer()`, and `onContextRestored()`.
 */

import type { MediaSource } from './media-source';
import type { ParallaxInput } from './input-handler';
import type { QualityParams } from './quality';

// ---------------------------------------------------------------------------
// Abstract base
// ---------------------------------------------------------------------------

export abstract class RendererBase {
  protected static readonly RESIZE_DEBOUNCE_MS = 100;

  // ---- Canvas + container ----
  protected readonly canvas: HTMLCanvasElement;
  protected readonly container: HTMLElement;

  // ---- Depth data dimensions ----
  /** GPU texture dimensions (may be clamped by quality tier). */
  protected depthWidth = 0;
  protected depthHeight = 0;
  /** Original source depth dimensions (from precomputed data). */
  protected sourceDepthWidth = 0;
  protected sourceDepthHeight = 0;
  /** Reusable buffer for subsampling depth data when GPU dims < source dims. */
  protected depthSubsampleBuffer: Uint8Array | null = null;

  // ---- Video dimensions (for cover-fit calculation) ----
  protected videoAspect = 16 / 9;

  // ---- Camera mode (selfie mirror) ----
  /** When true, computeCoverFitUV mirrors the X-axis for selfie mode. */
  protected isCameraSource = false;

  // ---- UV transform for cover-fit + overscan ----
  protected uvOffset = [0, 0];
  protected uvScale = [1, 1];

  // ---- Callbacks ----
  protected readDepth: ((timeSec: number) => Uint8Array) | null = null;
  protected readInput: (() => ParallaxInput) | null = null;
  protected mediaSource: MediaSource | null = null;
  /**
   * Optional callback invoked on each new video frame (from RVFC).
   * The Web Component uses this to dispatch frame events.
   */
  protected onVideoFrame: ((currentTime: number, frameNumber: number) => void) | null = null;

  // ---- Animation & resize ----
  protected animationFrameHandle = 0;
  /** requestVideoFrameCallback handle (0 = inactive). */
  protected rvfcHandle = 0;
  /** Whether RVFC is supported on the current video element. */
  protected rvfcSupported = false;
  protected resizeObserver: ResizeObserver | null = null;
  protected resizeTimer: number | null = null;

  // ---- Quality ----
  /** Adaptive quality parameters. Set by subclass constructor after GL init. */
  protected qualityParams!: QualityParams;

  constructor(parent: HTMLElement) {
    this.container = parent;
    this.canvas = document.createElement('canvas');
    this.container.appendChild(this.canvas);

    // Register context loss handler (identical across all renderers).
    // Context restored handler delegates to subclass via abstract method.
    this.canvas.addEventListener('webglcontextlost', this._handleContextLost);
    this.canvas.addEventListener('webglcontextrestored', this._handleContextRestored);
  }

  // -----------------------------------------------------------------------
  // Render loop control
  // -----------------------------------------------------------------------

  /**
   * Begin the render loop.
   *
   * For live sources (video/camera) with RVFC support, two loops run:
   * 1. RVFC loop — fires once per new video frame, handles depth update.
   * 2. RAF loop — fires at display refresh rate, handles input + render.
   *
   * For static sources (image) or when RVFC is unavailable, RAF-only.
   */
  start(
    source: MediaSource,
    readDepth: (timeSec: number) => Uint8Array,
    readInput: () => ParallaxInput,
    onVideoFrame?: (currentTime: number, frameNumber: number) => void
  ): void {
    this.stop();

    this.mediaSource = source;
    this.readDepth = readDepth;
    this.readInput = readInput;
    this.onVideoFrame = onVideoFrame ?? null;

    // RVFC is only available on live sources that expose the callback.
    this.rvfcSupported = source.isLive && typeof source.requestVideoFrameCallback === 'function';

    if (this.rvfcSupported) {
      this.rvfcHandle = source.requestVideoFrameCallback!(this._videoFrameLoop);
    } else if (!source.isLive) {
      // Static source: fire a single depth update at time 0.
      this.onDepthUpdate(source.currentTime);
    }

    // Always start the RAF loop for input + rendering.
    this.animationFrameHandle = window.requestAnimationFrame(this._rafLoop);
  }

  /** Stop both render loops and release callbacks. */
  stop(): void {
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }

    if (this.rvfcHandle && this.mediaSource?.cancelVideoFrameCallback) {
      this.mediaSource.cancelVideoFrameCallback(this.rvfcHandle);
      this.rvfcHandle = 0;
    }

    this.mediaSource = null;
    this.readDepth = null;
    this.readInput = null;
    this.onVideoFrame = null;
    this.rvfcSupported = false;
  }

  /** Stop rendering and release all GPU resources. */
  dispose(): void {
    this.stop();
    this.disposeRenderer();

    this.canvas.removeEventListener('webglcontextlost', this._handleContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this._handleContextRestored);
    this.canvas.remove();

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener('resize', this.scheduleResizeRecalculate);
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
  }

  // -----------------------------------------------------------------------
  // RVFC feature detection
  // -----------------------------------------------------------------------

  /** Check whether requestVideoFrameCallback is available. */
  protected static isRVFCSupported(): boolean {
    return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  }

  // -----------------------------------------------------------------------
  // Animation loops (private arrow fields for stable `this` binding)
  // -----------------------------------------------------------------------

  /**
   * RAF loop — fires at display refresh rate.
   * Delegates to subclass `onRenderFrame()` for the actual render work.
   */
  private readonly _rafLoop = () => {
    this.animationFrameHandle = window.requestAnimationFrame(this._rafLoop);
    this.onRenderFrame();
  };

  /**
   * RVFC callback — fires only when the browser presents a new video frame.
   * Delegates to subclass `onDepthUpdate()` for depth texture upload.
   */
  private readonly _videoFrameLoop = (
    _now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) => {
    const source = this.mediaSource;
    if (!source || !source.requestVideoFrameCallback) return;

    this.rvfcHandle = source.requestVideoFrameCallback(this._videoFrameLoop);

    const timeSec = metadata.mediaTime ?? source.currentTime;
    this.onDepthUpdate(timeSec);

    if (this.onVideoFrame) {
      this.onVideoFrame(timeSec, metadata.presentedFrames ?? 0);
    }
  };

  // -----------------------------------------------------------------------
  // Context loss handling
  // -----------------------------------------------------------------------

  private readonly _handleContextLost = (event: Event) => {
    event.preventDefault();
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
  };

  private readonly _handleContextRestored = () => {
    this.onContextRestored();
  };

  // -----------------------------------------------------------------------
  // Resize handling
  // -----------------------------------------------------------------------

  /**
   * Set up a ResizeObserver on the container element and a fallback
   * window resize listener. Called by subclass after GPU init.
   */
  protected setupResizeHandling(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleResizeRecalculate();
      });
      this.resizeObserver.observe(this.container);
    }

    window.addEventListener('resize', this.scheduleResizeRecalculate);
    this.recalculateViewportLayout();
  }

  /** Debounce resize events to avoid expensive layout recalculations. */
  protected readonly scheduleResizeRecalculate = () => {
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.recalculateViewportLayout();
    }, RendererBase.RESIZE_DEBOUNCE_MS);
  };

  /** Read the container's pixel dimensions, with a minimum of 1x1. */
  protected getViewportSize(): { width: number; height: number } {
    const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight));
    return { width, height };
  }

  // -----------------------------------------------------------------------
  // Depth dimension utilities
  // -----------------------------------------------------------------------

  /**
   * Clamp depth dimensions to the quality tier's maximum and allocate
   * the subsample buffer if needed. Called during `initialize()`.
   */
  protected clampDepthDimensions(
    sourceWidth: number,
    sourceHeight: number,
    maxDim: number
  ): void {
    this.sourceDepthWidth = sourceWidth;
    this.sourceDepthHeight = sourceHeight;

    let gpuW = sourceWidth;
    let gpuH = sourceHeight;
    if (gpuW > maxDim || gpuH > maxDim) {
      const scale = maxDim / Math.max(gpuW, gpuH);
      gpuW = Math.max(1, Math.round(gpuW * scale));
      gpuH = Math.max(1, Math.round(gpuH * scale));
    }
    this.depthWidth = gpuW;
    this.depthHeight = gpuH;

    if (gpuW !== sourceWidth || gpuH !== sourceHeight) {
      this.depthSubsampleBuffer = new Uint8Array(gpuW * gpuH);
    } else {
      this.depthSubsampleBuffer = null;
    }
  }

  /**
   * CPU nearest-neighbor depth subsampling.
   *
   * Returns the original data if no subsampling is needed, otherwise
   * fills and returns the pre-allocated subsample buffer.
   */
  protected subsampleDepth(depthData: Uint8Array): Uint8Array {
    if (!this.depthSubsampleBuffer) return depthData;

    const buf = this.depthSubsampleBuffer;
    const srcW = this.sourceDepthWidth;
    const dstW = this.depthWidth;
    const dstH = this.depthHeight;

    for (let y = 0; y < dstH; y++) {
      const srcY = Math.min(Math.round(y * srcW / dstW), this.sourceDepthHeight - 1);
      const srcRowOffset = srcY * srcW;
      const dstRowOffset = y * dstW;
      for (let x = 0; x < dstW; x++) {
        const srcX = Math.min(Math.round(x * srcW / dstW), srcW - 1);
        buf[dstRowOffset + x] = depthData[srcRowOffset + srcX];
      }
    }
    return buf;
  }

  // -----------------------------------------------------------------------
  // Cover-fit UV computation
  // -----------------------------------------------------------------------

  /**
   * Compute cover-fit + overscan UV transform.
   *
   * The video fills the viewport (cover-fit), and overscan adds extra
   * visible area so parallax displacement doesn't reveal edges.
   * Updates `this.uvOffset` and `this.uvScale`.
   */
  protected computeCoverFitUV(
    parallaxStrength: number,
    overscanPadding: number
  ): void {
    const { width, height } = this.getViewportSize();
    const viewportAspect = width / height;
    const extra = parallaxStrength + overscanPadding;

    let scaleU = 1.0;
    let scaleV = 1.0;

    if (viewportAspect > this.videoAspect) {
      scaleV = this.videoAspect / viewportAspect;
    } else {
      scaleU = viewportAspect / this.videoAspect;
    }

    const overscanScale = 1.0 + extra * 2;
    scaleU /= overscanScale;
    scaleV /= overscanScale;

    this.uvOffset = [(1.0 - scaleU) / 2.0, (1.0 - scaleV) / 2.0];
    this.uvScale = [scaleU, scaleV];

    // Selfie mirror: negate uvScale.x so that baseUv 0→1 maps to the
    // reverse UV range, giving a horizontal mirror. Each renderer picks
    // this up when it writes the UV uniforms to the GPU.
    if (this.isCameraSource) {
      this.uvOffset[0] += this.uvScale[0];
      this.uvScale[0] = -this.uvScale[0];
    }
  }

  // -----------------------------------------------------------------------
  // Abstract methods — subclass implements
  // -----------------------------------------------------------------------

  /** Main render frame logic (called from RAF loop at display refresh rate). */
  protected abstract onRenderFrame(): void;

  /** Depth texture upload + filter (called from RVFC loop at video frame rate). */
  protected abstract onDepthUpdate(timeSec: number): void;

  /** Recalculate canvas size, FBOs, UV transform on resize. */
  protected abstract recalculateViewportLayout(): void;

  /** Release all GPU resources (called from dispose()). */
  protected abstract disposeRenderer(): void;

  /** Rebuild GPU state after context restoration. */
  protected abstract onContextRestored(): void;
}
