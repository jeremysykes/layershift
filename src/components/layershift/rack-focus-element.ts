/**
 * <layershift-rack-focus> Web Component
 *
 * A self-contained Custom Element that renders a depth-aware bokeh blur
 * (rack focus / depth-of-field) effect on video, image, or camera content.
 * Users control the focal plane via pointer/touch/scroll with spring-damped
 * transitions. Encapsulates the multi-pass WebGL 2 pipeline inside a Shadow DOM.
 *
 * Usage:
 *   <layershift-rack-focus
 *     src="video.mp4"
 *     depth-src="depth-data.bin"
 *     depth-meta="depth-meta.json"
 *   ></layershift-rack-focus>
 */

import {
  DepthFrameInterpolator,
  loadPrecomputedDepth,
  createFlatDepthData,
  type PrecomputedDepthData,
} from '../../precomputed-depth';
import { analyzeDepthFrames, deriveFocusParams } from '../../depth-analysis';
import { RackFocusRenderer, type RackFocusRendererConfig } from '../../rack-focus-renderer';
import { RackFocusRendererWebGPU } from '../../rack-focus-renderer-webgpu';
import { detectGPUBackend } from '../../gpu-backend';
import { createVideoSource, createImageSource, createCameraSource, type MediaSource } from '../../media-source';
import { createDepthEstimator, type DepthEstimator } from '../../depth-estimator';
import { FocusInputHandler, type FocusState } from '../../focus-input-handler';
import type {
  RackFocusReadyDetail,
  RackFocusPlayDetail,
  RackFocusPauseDetail,
  RackFocusLoopDetail,
  RackFocusFrameDetail,
  RackFocusErrorDetail,
  RackFocusFocusChangeDetail,
  RackFocusFocusSettledDetail,
  LayershiftModelProgressDetail,
} from './types';
import { LifecycleManager } from './lifecycle';
import type { ManagedElement } from './lifecycle';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  focusMode: 'auto' as const,
  focusDepth: 0.5,
  focusRange: 0.05,
  transitionSpeed: 300,
  aperture: 1.0,
  maxBlur: 24.0,
  depthScale: 50.0,
  highlightBloom: true,
  highlightThreshold: 0.85,
  focusBreathing: 0.015,
  vignette: 0.15,
  autoplay: true,
  loop: true,
  muted: true,
} as const;

/** Default depth estimation output dimensions (matches precomputed convention). */
const DEPTH_EST_WIDTH = 512;
const DEPTH_EST_HEIGHT = 512;

// ---------------------------------------------------------------------------
// Custom Element
// ---------------------------------------------------------------------------

export class LayershiftRackFocusElement extends HTMLElement implements ManagedElement {
  static readonly TAG_NAME = 'layershift-rack-focus';

  static get observedAttributes(): string[] {
    return [
      'src', 'depth-src', 'depth-meta', 'depth-model', 'source-type',
      'focus-mode', 'focus-depth', 'focus-range',
      'transition-speed', 'aperture', 'max-blur', 'depth-scale',
      'highlight-bloom', 'highlight-threshold',
      'focus-breathing', 'vignette',
      'quality', 'gpu-backend',
      'autoplay', 'loop', 'muted',
    ];
  }

  readonly reinitAttributes = ['src', 'depth-src', 'depth-meta', 'depth-model', 'source-type'];

  canInit(): boolean {
    if (this.sourceType === 'camera') return true;
    const hasSrc = !!this.getAttribute('src');
    const hasPrecomputedDepth = !!this.getAttribute('depth-src') && !!this.getAttribute('depth-meta');
    const hasDepthModel = !!this.getAttribute('depth-model');
    return hasSrc && (hasPrecomputedDepth || hasDepthModel);
  }

  private shadow: ShadowRoot;
  private container: HTMLDivElement | null = null;
  private renderer: RackFocusRenderer | RackFocusRendererWebGPU | null = null;
  private focusHandler: FocusInputHandler | null = null;
  private source: MediaSource | null = null;
  private depthEstimator: DepthEstimator | null = null;
  private loopCount = 0;
  private latestDepthData: Uint8Array | null = null;
  private wasSettled = true;
  private readonly lifecycle: LifecycleManager;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
    this.lifecycle = new LifecycleManager(this);
  }

  // --- Attribute helpers ---

  private getAttrFloat(name: string, fallback: number): number {
    const val = this.getAttribute(name);
    if (val === null) return fallback;
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  private getAttrBool(name: string, fallback: boolean): boolean {
    if (!this.hasAttribute(name)) return fallback;
    const val = this.getAttribute(name);
    if (val === 'false' || val === '0') return false;
    return true;
  }

  private get sourceType(): 'video' | 'image' | 'camera' {
    const val = this.getAttribute('source-type');
    if (val === 'camera') return 'camera';
    if (val === 'image') return 'image';
    return 'video';
  }
  private get focusMode(): 'auto' | 'pointer' | 'scroll' | 'programmatic' {
    const val = this.getAttribute('focus-mode');
    if (val === 'pointer' || val === 'scroll' || val === 'programmatic') return val;
    return DEFAULTS.focusMode;
  }
  private get focusDepthAttr(): number { return this.getAttrFloat('focus-depth', DEFAULTS.focusDepth); }
  private get focusRangeAttr(): number { return this.getAttrFloat('focus-range', DEFAULTS.focusRange); }
  private get transitionSpeedAttr(): number { return this.getAttrFloat('transition-speed', DEFAULTS.transitionSpeed); }
  private get apertureAttr(): number { return this.getAttrFloat('aperture', DEFAULTS.aperture); }
  private get maxBlurAttr(): number { return this.getAttrFloat('max-blur', DEFAULTS.maxBlur); }
  private get depthScaleAttr(): number { return this.getAttrFloat('depth-scale', DEFAULTS.depthScale); }
  private get highlightBloomAttr(): boolean { return this.getAttrBool('highlight-bloom', DEFAULTS.highlightBloom); }
  private get highlightThresholdAttr(): number { return this.getAttrFloat('highlight-threshold', DEFAULTS.highlightThreshold); }
  private get focusBreathingAttr(): number { return this.getAttrFloat('focus-breathing', DEFAULTS.focusBreathing); }
  private get vignetteAttr(): number { return this.getAttrFloat('vignette', DEFAULTS.vignette); }
  private get quality(): 'auto' | 'high' | 'medium' | 'low' | undefined {
    const val = this.getAttribute('quality');
    if (val === 'auto' || val === 'high' || val === 'medium' || val === 'low') return val;
    return undefined;
  }
  private get gpuBackend(): 'webgpu' | 'webgl2' | 'auto' {
    const val = this.getAttribute('gpu-backend');
    if (val === 'webgpu' || val === 'webgl2') return val;
    return 'auto';
  }
  private get depthModel(): string | null { return this.getAttribute('depth-model'); }
  private get shouldAutoplay(): boolean { return this.getAttrBool('autoplay', DEFAULTS.autoplay); }
  private get shouldLoop(): boolean { return this.getAttrBool('loop', DEFAULTS.loop); }
  private get shouldMute(): boolean { return this.getAttrBool('muted', DEFAULTS.muted); }

  // --- Public JS API ---

  /** Current focal depth [0,1]. Setting triggers a spring transition. */
  get focusDepth(): number {
    return this.focusHandler?.currentFocalDepth ?? this.focusDepthAttr;
  }

  set focusDepth(value: number) {
    this.setFocusDepth(value);
  }

  /** Whether the focus spring is currently transitioning. */
  get transitioning(): boolean {
    return this.focusHandler?.isTransitioning ?? false;
  }

  /** Programmatically set focus depth with optional transition duration. */
  setFocusDepth(depth: number, options?: { duration?: number }): void {
    if (!this.focusHandler) return;
    this.focusHandler.setFocusDepth(depth, options);
    this.emit<RackFocusFocusChangeDetail>('layershift-rack-focus:focus-change', {
      targetDepth: depth,
      transitionDuration: options?.duration ?? this.transitionSpeedAttr,
      source: 'api',
    });
  }

  /** Reset focus to the auto-determined depth. */
  resetFocus(): void {
    this.focusHandler?.resetFocus();
  }

  // --- Event dispatching ---

  private emit<T>(eventName: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private attachSourceEventListeners(source: MediaSource): void {
    if (!source.addEventListener) return;

    source.addEventListener('play', (() => {
      this.emit<RackFocusPlayDetail>('layershift-rack-focus:play', {
        currentTime: source.currentTime,
      });
    }) as EventListener);

    source.addEventListener('pause', (() => {
      this.emit<RackFocusPauseDetail>('layershift-rack-focus:pause', {
        currentTime: source.currentTime,
      });
    }) as EventListener);

    source.addEventListener('ended', (() => {
      this.loopCount += 1;
      this.emit<RackFocusLoopDetail>('layershift-rack-focus:loop', {
        loopCount: this.loopCount,
      });
    }) as EventListener);
  }

  // --- Lifecycle (delegated to LifecycleManager) ---

  connectedCallback(): void {
    this.lifecycle.onConnected();
  }

  disconnectedCallback(): void {
    this.lifecycle.onDisconnected();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    this.lifecycle.onAttributeChanged(name, oldVal, newVal);
  }

  // --- Shadow DOM setup ---

  setupShadowDOM(): void {
    this.shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        background: #000;
      }
      .container {
        width: 100%;
        height: 100%;
        position: absolute;
        inset: 0;
      }
      canvas {
        display: block;
        width: 100%;
        height: 100%;
      }
    `;
    this.shadow.appendChild(style);

    this.container = document.createElement('div');
    this.container.className = 'container';
    this.shadow.appendChild(this.container);
  }

  // --- Initialization ---

  async doInit(signal: AbortSignal): Promise<void> {
    if (!this.container) return;

    const isCamera = this.sourceType === 'camera';
    const modelUrl = this.depthModel;

    try {
      let source: MediaSource;
      let depthData: PrecomputedDepthData;
      let estimator: DepthEstimator | null = null;

      // Progress callback for model download.
      const onModelProgress = (p: import('../../depth-estimator').ModelDownloadProgress) => {
        this.emit<LayershiftModelProgressDetail>('layershift-rack-focus:model-progress', p);
      };

      if (isCamera) {
        source = await createCameraSource(
          { video: { facingMode: 'user' } },
          { parent: this.shadow },
        );
        if (signal.aborted) { source.dispose(); return; }

        if (modelUrl) {
          estimator = await createDepthEstimator(modelUrl, DEPTH_EST_WIDTH, DEPTH_EST_HEIGHT, onModelProgress);
          if (signal.aborted) { estimator.dispose(); source.dispose(); return; }
          depthData = createFlatDepthData(DEPTH_EST_WIDTH, DEPTH_EST_HEIGHT);
        } else {
          depthData = createFlatDepthData(source.width, source.height);
        }
      } else {
        const src = this.getAttribute('src')!;
        const depthSrc = this.getAttribute('depth-src');
        const depthMeta = this.getAttribute('depth-meta');
        const hasPrecomputedDepth = !!depthSrc && !!depthMeta;

        const isImage = this.sourceType === 'image'
          || /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(src);

        if (hasPrecomputedDepth) {
          const [mediaResult, loadedDepth] = await Promise.all([
            isImage
              ? createImageSource(src)
              : createVideoSource(src, {
                  parent: this.shadow,
                  loop: this.shouldLoop,
                  muted: this.shouldMute,
                }),
            loadPrecomputedDepth(depthSrc!, depthMeta!),
          ]);

          if (signal.aborted) { mediaResult.dispose(); return; }
          source = mediaResult;
          depthData = loadedDepth;
        } else if (modelUrl) {
          const [mediaResult, est] = await Promise.all([
            isImage
              ? createImageSource(src)
              : createVideoSource(src, {
                  parent: this.shadow,
                  loop: this.shouldLoop,
                  muted: this.shouldMute,
                }),
            createDepthEstimator(modelUrl, DEPTH_EST_WIDTH, DEPTH_EST_HEIGHT, onModelProgress),
          ]);

          if (signal.aborted) { mediaResult.dispose(); est.dispose(); return; }
          source = mediaResult;
          estimator = est;

          if (isImage || !source.isLive) {
            const imgSrc = source.getImageSource();
            if (imgSrc) {
              const depthFrame = await estimator.submitFrameAndWait(imgSrc);
              depthData = {
                meta: { frameCount: 1, fps: 1, width: DEPTH_EST_WIDTH, height: DEPTH_EST_HEIGHT, sourceFps: 1 },
                frames: [depthFrame],
              };
            } else {
              depthData = createFlatDepthData(DEPTH_EST_WIDTH, DEPTH_EST_HEIGHT);
            }
          } else {
            depthData = createFlatDepthData(DEPTH_EST_WIDTH, DEPTH_EST_HEIGHT);
          }
        } else {
          throw new Error('Either depth-src/depth-meta or depth-model must be provided.');
        }
      }

      this.source = source;
      this.depthEstimator = estimator;
      this.loopCount = 0;
      this.attachSourceEventListeners(source);

      // --- Depth analysis + focus param derivation ---
      const depthProfile = analyzeDepthFrames(
        depthData.frames,
        depthData.meta.width,
        depthData.meta.height,
      );
      const derivedFocusParams = deriveFocusParams(depthProfile);

      // Apply override precedence: explicit config > derived > defaults.
      const autoFocusDepth = this.hasAttribute('focus-depth')
        ? this.focusDepthAttr
        : derivedFocusParams.autoFocusDepth;
      const focusRange = this.hasAttribute('focus-range')
        ? this.focusRangeAttr
        : derivedFocusParams.focusRange;
      const depthScale = this.hasAttribute('depth-scale')
        ? this.depthScaleAttr
        : derivedFocusParams.depthScale;

      // --- Create renderer ---
      const rendererConfig: RackFocusRendererConfig = {
        aperture: this.apertureAttr,
        maxBlurRadius: this.maxBlurAttr,
        focusRange,
        depthScale,
        highlightBloom: this.highlightBloomAttr,
        highlightThreshold: this.highlightThresholdAttr,
        highlightBoost: 2.0,
        vignetteStrength: this.vignetteAttr,
        quality: this.quality,
      };

      const backend = await detectGPUBackend(this.gpuBackend);

      if (signal.aborted) return;

      if (backend.type === 'webgpu' && backend.device && backend.adapter) {
        this.renderer = new RackFocusRendererWebGPU(
          this.container!, rendererConfig, backend.device, backend.adapter.info,
        );
      } else {
        this.renderer = new RackFocusRenderer(this.container!, rendererConfig);
      }
      this.renderer.initialize(source, depthData.meta.width, depthData.meta.height);

      // --- Create focus input handler ---
      this.focusHandler = new FocusInputHandler(
        this,
        {
          mode: this.focusMode,
          transitionSpeed: this.transitionSpeedAttr,
          breathAmount: this.focusBreathingAttr,
          autoFocusDepth,
        },
        depthData.meta.width,
        depthData.meta.height,
      );

      // Depth read callback.
      let readDepth: (timeSec: number) => Uint8Array;
      if (estimator) {
        readDepth = () => estimator!.getLatestDepth();
      } else {
        const interpolator = new DepthFrameInterpolator(depthData);
        readDepth = (timeSec: number) => interpolator.sample(timeSec);
      }

      // Store depth data for focus handler pointer sampling.
      this.latestDepthData = depthData.frames[0] ?? null;
      if (this.latestDepthData) {
        this.focusHandler.updateDepthData(this.latestDepthData);
      }
      this.wasSettled = true;

      const currentEstimator = estimator;
      const currentFocusHandler = this.focusHandler;

      // Set focus state callback — rack focus uses this instead of readInput.
      this.renderer.setFocusStateCallback(() => {
        // Read focus state from handler, passing latest depth data.
        const state = currentFocusHandler.update(
          this.latestDepthData ?? new Uint8Array(0),
          performance.now()
        );

        // Emit focus-settled event on spring settle.
        if (this.wasSettled === false && !state.transitioning) {
          this.emit<RackFocusFocusSettledDetail>('layershift-rack-focus:focus-settled', {
            focalDepth: state.focalDepth,
          });
        }
        this.wasSettled = !state.transitioning;

        return state;
      });

      this.renderer.start(
        source,
        (timeSec: number) => {
          const data = readDepth(timeSec);
          // Update latest depth data for pointer sampling.
          this.latestDepthData = data;
          currentFocusHandler.updateDepthData(data);
          return data;
        },
        () => ({ x: 0, y: 0 }),
        (currentTime: number, frameNumber: number) => {
          if (currentEstimator) {
            const imgSrc = source.getImageSource();
            if (imgSrc) currentEstimator.submitFrame(imgSrc);
          }
          this.emit<RackFocusFrameDetail>('layershift-rack-focus:frame', {
            currentTime,
            frameNumber,
          });
        }
      );

      // Autoplay.
      if (!isCamera && source.isLive && this.shouldAutoplay && source.play) {
        try {
          await source.play();
        } catch {
          // Autoplay may be blocked by browser policy.
        }
      }

      if (signal.aborted) return;

      this.lifecycle.markInitialized();

      this.emit<RackFocusReadyDetail>('layershift-rack-focus:ready', {
        videoWidth: source.width,
        videoHeight: source.height,
        duration: source.duration,
        depthProfile,
        derivedFocusParams,
        initialFocusDepth: autoFocusDepth,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize.';
      console.error('<layershift-rack-focus>: Failed to initialize.', err);
      this.emit<RackFocusErrorDetail>('layershift-rack-focus:error', { message });
    }
  }

  // --- Cleanup ---

  doDispose(): void {
    this.renderer?.dispose();
    this.renderer = null;

    this.focusHandler?.dispose();
    this.focusHandler = null;

    this.depthEstimator?.dispose();
    this.depthEstimator = null;

    this.source?.dispose();
    this.source = null;

    this.latestDepthData = null;
    this.wasSettled = true;
    this.loopCount = 0;
    this.container = null;
  }
}
