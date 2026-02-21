/**
 * <layershift-parallax> Web Component
 *
 * A self-contained Custom Element that renders a depth-aware parallax
 * video effect. Encapsulates the entire WebGL pipeline inside a
 * Shadow DOM — consumers just drop in the tag and provide asset URLs.
 *
 * Usage:
 *   <layershift-parallax
 *     src="video.mp4"
 *     depth-src="depth-data.bin"
 *     depth-meta="depth-meta.json"
 *   ></layershift-parallax>
 */

import {
  DepthFrameInterpolator,
  loadPrecomputedDepth,
  createFlatDepthData,
  type PrecomputedDepthData,
} from '../../precomputed-depth';
import { analyzeDepthFrames, deriveParallaxParams } from '../../depth-analysis';
import { ParallaxRenderer } from '../../parallax-renderer';
import { ParallaxRendererWebGPU } from '../../parallax-renderer-webgpu';
import { detectGPUBackend } from '../../gpu-backend';
import { createVideoSource, createImageSource, createCameraSource, type MediaSource } from '../../media-source';
import type { ParallaxInput } from '../../input-handler';
import type {
  LayershiftReadyDetail,
  LayershiftPlayDetail,
  LayershiftPauseDetail,
  LayershiftLoopDetail,
  LayershiftFrameDetail,
  LayershiftErrorDetail,
} from './types';
import { LifecycleManager } from './lifecycle';
import type { ManagedElement } from './lifecycle';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  parallaxX: 0.4,
  parallaxY: 1.0,
  parallaxMax: 30,
  layers: 5,
  overscan: 0.05,
  autoplay: true,
  loop: true,
  muted: true,
} as const;

// ---------------------------------------------------------------------------
// Input handler (scoped to component host element)
// ---------------------------------------------------------------------------

class ComponentInputHandler {
  private pointerTarget: ParallaxInput = { x: 0, y: 0 };
  private motionTarget: ParallaxInput = { x: 0, y: 0 };
  private smoothedOutput: ParallaxInput = { x: 0, y: 0 };
  private usingMotionInput = false;
  private motionListenerAttached = false;
  private motionRequested = false;
  private touchActive = false;
  private touchAnchorX = 0;
  private touchAnchorY = 0;
  private readonly lerpFactor: number;
  private readonly motionLerpFactor: number;

  /** Pixels of finger drag to reach full parallax offset (-1 or 1). */
  private static readonly TOUCH_DRAG_RANGE = 100;

  constructor(
    private readonly host: HTMLElement,
    lerpFactor = 0.08,
    motionLerpFactor = 0.06
  ) {
    this.lerpFactor = lerpFactor;
    this.motionLerpFactor = motionLerpFactor;
    this.host.addEventListener('mousemove', this.handleMouseMove);
    this.host.addEventListener('mouseleave', this.resetPointerTarget);
    this.host.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.host.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    this.host.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    this.host.addEventListener('touchcancel', this.handleTouchEnd, { passive: true });
  }

  update(): ParallaxInput {
    // Priority: touch (finger on screen) > gyro > mouse
    const target = this.touchActive
      ? this.pointerTarget
      : this.usingMotionInput
        ? this.motionTarget
        : this.pointerTarget;
    const factor = this.usingMotionInput && !this.touchActive
      ? this.motionLerpFactor
      : this.lerpFactor;
    this.smoothedOutput.x = lerp(this.smoothedOutput.x, target.x, factor);
    this.smoothedOutput.y = lerp(this.smoothedOutput.y, target.y, factor);
    return this.smoothedOutput;
  }

  dispose(): void {
    this.host.removeEventListener('mousemove', this.handleMouseMove);
    this.host.removeEventListener('mouseleave', this.resetPointerTarget);
    this.host.removeEventListener('touchstart', this.handleTouchStart);
    this.host.removeEventListener('touchmove', this.handleTouchMove);
    this.host.removeEventListener('touchend', this.handleTouchEnd);
    this.host.removeEventListener('touchcancel', this.handleTouchEnd);
    if (this.motionListenerAttached) {
      window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
      this.motionListenerAttached = false;
    }
  }

  private readonly handleMouseMove = (event: MouseEvent) => {
    const rect = this.host.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    this.pointerTarget.x = clamp(x, -1, 1);
    this.pointerTarget.y = clamp(y, -1, 1);
  };

  private readonly resetPointerTarget = () => {
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
  };

  private readonly handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchActive = true;
    this.touchAnchorX = touch.clientX;
    this.touchAnchorY = touch.clientY;
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;

    // Request gyro permission on first touch (non-blocking).
    // Touch input works immediately; gyro activates in the background.
    if (!this.motionRequested) {
      this.motionRequested = true;
      void this.requestMotionPermission();
    }
  };

  private readonly handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - this.touchAnchorX;
    const dy = touch.clientY - this.touchAnchorY;
    const range = ComponentInputHandler.TOUCH_DRAG_RANGE;
    this.pointerTarget.x = clamp(dx / range, -1, 1);
    this.pointerTarget.y = clamp(dy / range, -1, 1);
  };

  private readonly handleTouchEnd = () => {
    this.touchActive = false;
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
  };

  private async requestMotionPermission(): Promise<void> {
    if (typeof DeviceOrientationEvent === 'undefined') return;

    type IOSEvent = typeof DeviceOrientationEvent & {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    const motionEvent = DeviceOrientationEvent as IOSEvent;

    if (typeof motionEvent.requestPermission === 'function') {
      try {
        const result = await motionEvent.requestPermission();
        if (result !== 'granted') return;
      } catch {
        return;
      }
    }

    if (!this.motionListenerAttached) {
      window.addEventListener('deviceorientation', this.handleDeviceOrientation);
      this.motionListenerAttached = true;
    }
    this.usingMotionInput = true;
  }

  private readonly handleDeviceOrientation = (event: DeviceOrientationEvent) => {
    const rawX = clamp((event.gamma ?? 0) / 45, -1, 1);
    const rawY = clamp((event.beta ?? 0) / 45, -1, 1);
    this.motionTarget.x = lerp(this.motionTarget.x, rawX, this.motionLerpFactor);
    this.motionTarget.y = lerp(this.motionTarget.y, rawY, this.motionLerpFactor);
  };
}

// ---------------------------------------------------------------------------
// Custom Element
// ---------------------------------------------------------------------------

export class LayershiftElement extends HTMLElement implements ManagedElement {
  static readonly TAG_NAME = 'layershift-parallax';

  static get observedAttributes(): string[] {
    return [
      'src', 'depth-src', 'depth-meta', 'source-type',
      'parallax-x', 'parallax-y', 'parallax-max',
      'layers', 'overscan', 'quality', 'gpu-backend',
      'autoplay', 'loop', 'muted',
    ];
  }

  readonly reinitAttributes = ['src', 'depth-src', 'depth-meta', 'source-type'];

  canInit(): boolean {
    if (this.sourceType === 'camera') return true;
    return !!this.getAttribute('src')
      && !!this.getAttribute('depth-src')
      && !!this.getAttribute('depth-meta');
  }

  private shadow: ShadowRoot;
  private container: HTMLDivElement | null = null;
  private renderer: ParallaxRenderer | ParallaxRendererWebGPU | null = null;
  private inputHandler: ComponentInputHandler | null = null;
  private source: MediaSource | null = null;
  private loopCount = 0;
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
    // Boolean attributes: presence = true, absence = false
    // But also handle explicit "false" string
    if (val === 'false' || val === '0') return false;
    return true;
  }

  private get parallaxX(): number { return this.getAttrFloat('parallax-x', DEFAULTS.parallaxX); }
  private get parallaxY(): number { return this.getAttrFloat('parallax-y', DEFAULTS.parallaxY); }
  private get parallaxMax(): number { return this.getAttrFloat('parallax-max', DEFAULTS.parallaxMax); }
  private get overscan(): number { return this.getAttrFloat('overscan', DEFAULTS.overscan); }
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
  private get sourceType(): 'video' | 'image' | 'camera' {
    const val = this.getAttribute('source-type');
    if (val === 'camera') return 'camera';
    if (val === 'image') return 'image';
    return 'video';
  }
  private get shouldAutoplay(): boolean { return this.getAttrBool('autoplay', DEFAULTS.autoplay); }
  private get shouldLoop(): boolean { return this.getAttrBool('loop', DEFAULTS.loop); }
  private get shouldMute(): boolean { return this.getAttrBool('muted', DEFAULTS.muted); }

  // --- Event dispatching ---

  /**
   * Dispatch a namespaced custom event that bubbles through Shadow DOM.
   * All events use the `layershift-parallax:` prefix and are `composed`
   * so consumers can listen on the host element from the light DOM.
   */
  private emit<T>(eventName: string, detail: T): void {
    this.dispatchEvent(
      new CustomEvent(eventName, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  /**
   * Attach native video event listeners and re-dispatch them
   * as namespaced custom events on the host element.
   */
  private attachSourceEventListeners(source: MediaSource): void {
    if (!source.addEventListener) return;

    source.addEventListener('play', (() => {
      this.emit<LayershiftPlayDetail>('layershift-parallax:play', {
        currentTime: source.currentTime,
      });
    }) as EventListener);

    source.addEventListener('pause', (() => {
      this.emit<LayershiftPauseDetail>('layershift-parallax:pause', {
        currentTime: source.currentTime,
      });
    }) as EventListener);

    source.addEventListener('ended', (() => {
      this.loopCount += 1;
      this.emit<LayershiftLoopDetail>('layershift-parallax:loop', {
        loopCount: this.loopCount,
      });
    }) as EventListener);
  }

  // --- Lifecycle ---

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

    try {
      let source: MediaSource;
      let depthData: PrecomputedDepthData;

      if (isCamera) {
        source = await createCameraSource(
          { video: { facingMode: 'user' } },
          { parent: this.shadow },
        );
        if (signal.aborted) { source.dispose(); return; }
        depthData = createFlatDepthData(source.width, source.height);
      } else {
        const src = this.getAttribute('src')!;
        const depthSrc = this.getAttribute('depth-src')!;
        const depthMeta = this.getAttribute('depth-meta')!;

        const isImage = this.sourceType === 'image'
          || /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(src);

        const [mediaResult, loadedDepth] = await Promise.all([
          isImage
            ? createImageSource(src)
            : createVideoSource(src, {
                parent: this.shadow,
                loop: this.shouldLoop,
                muted: this.shouldMute,
              }),
          loadPrecomputedDepth(depthSrc, depthMeta),
        ]);

        if (signal.aborted) { mediaResult.dispose(); return; }
        source = mediaResult;
        depthData = loadedDepth;
      }

      this.source = source;
      this.loopCount = 0;
      this.attachSourceEventListeners(source);

      const depthProfile = analyzeDepthFrames(
        depthData.frames,
        depthData.meta.width,
        depthData.meta.height,
      );
      const derivedParams = deriveParallaxParams(depthProfile);

      const parallaxStrength = this.hasAttribute('parallax-max')
        ? this.parallaxMax / Math.max(source.width, 1)
        : derivedParams.parallaxStrength;

      const overscanPadding = this.hasAttribute('overscan')
        ? this.overscan
        : derivedParams.overscanPadding;

      const interpolator = new DepthFrameInterpolator(depthData);
      const readDepth = (timeSec: number) => interpolator.sample(timeSec);

      const backend = await detectGPUBackend(this.gpuBackend);

      if (signal.aborted) return;

      const rendererConfig = {
        parallaxStrength,
        pomEnabled: true,
        pomSteps: derivedParams.pomSteps,
        overscanPadding,
        quality: this.quality,
        contrastLow: derivedParams.contrastLow,
        contrastHigh: derivedParams.contrastHigh,
        verticalReduction: derivedParams.verticalReduction,
        dofStart: derivedParams.dofStart,
        dofStrength: derivedParams.dofStrength,
      };

      if (backend.type === 'webgpu' && backend.device && backend.adapter) {
        this.renderer = new ParallaxRendererWebGPU(
          this.container!,
          rendererConfig,
          backend.device,
          backend.adapter.info,
        );
      } else {
        this.renderer = new ParallaxRenderer(this.container!, rendererConfig);
      }

      this.renderer.initialize(source, depthData.meta.width, depthData.meta.height);

      this.inputHandler = new ComponentInputHandler(this);

      const pxFactor = this.parallaxX;
      const pyFactor = this.parallaxY;

      this.renderer.start(
        source,
        readDepth,
        () => {
          if (!this.inputHandler) return { x: 0, y: 0 };
          const raw = this.inputHandler.update();
          return {
            x: raw.x * pxFactor,
            y: raw.y * pyFactor,
          };
        },
        (currentTime: number, frameNumber: number) => {
          this.emit<LayershiftFrameDetail>('layershift-parallax:frame', {
            currentTime,
            frameNumber,
          });
        }
      );

      if (!isCamera && source.isLive && this.shouldAutoplay && source.play) {
        try {
          await source.play();
        } catch {
          // Autoplay may be blocked by browser policy
        }
      }

      if (signal.aborted) return;

      this.lifecycle.markInitialized();

      this.emit<LayershiftReadyDetail>('layershift-parallax:ready', {
        videoWidth: source.width,
        videoHeight: source.height,
        duration: source.duration,
        depthProfile,
        derivedParams,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize.';
      console.error('<layershift-parallax>: Failed to initialize.', err);
      this.emit<LayershiftErrorDetail>('layershift-parallax:error', { message });
    }
  }

  // --- Cleanup ---

  doDispose(): void {
    this.renderer?.dispose();
    this.renderer = null;

    this.inputHandler?.dispose();
    this.inputHandler = null;

    this.source?.dispose();
    this.source = null;

    this.loopCount = 0;
    this.container = null;
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

