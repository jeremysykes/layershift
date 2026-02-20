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
} from '../../precomputed-depth';
import { analyzeDepthFrames, deriveParallaxParams } from '../../depth-analysis';
import { ParallaxRenderer } from '../../parallax-renderer';
import { ParallaxRendererWebGPU } from '../../parallax-renderer-webgpu';
import { detectGPUBackend } from '../../gpu-backend';
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
      'src', 'depth-src', 'depth-meta',
      'parallax-x', 'parallax-y', 'parallax-max',
      'layers', 'overscan', 'quality', 'gpu-backend',
      'autoplay', 'loop', 'muted',
    ];
  }

  readonly reinitAttributes = ['src', 'depth-src', 'depth-meta'];

  private shadow: ShadowRoot;
  private container: HTMLDivElement | null = null;
  private renderer: ParallaxRenderer | ParallaxRendererWebGPU | null = null;
  private inputHandler: ComponentInputHandler | null = null;
  private video: HTMLVideoElement | null = null;
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
  private attachVideoEventListeners(video: HTMLVideoElement): void {
    video.addEventListener('play', () => {
      this.emit<LayershiftPlayDetail>('layershift-parallax:play', {
        currentTime: video.currentTime,
      });
    });

    video.addEventListener('pause', () => {
      this.emit<LayershiftPauseDetail>('layershift-parallax:pause', {
        currentTime: video.currentTime,
      });
    });

    video.addEventListener('ended', () => {
      // The 'ended' event fires on a looping video just before the
      // browser resets currentTime to 0 and continues playback.
      if (video.loop) {
        this.loopCount += 1;
        this.emit<LayershiftLoopDetail>('layershift-parallax:loop', {
          loopCount: this.loopCount,
        });
      }
    });
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
    const src = this.getAttribute('src')!;
    const depthSrc = this.getAttribute('depth-src')!;
    const depthMeta = this.getAttribute('depth-meta')!;

    if (!this.container) return;

    try {
      // Load video and depth data in parallel
      const [video, depthData] = await Promise.all([
        this.createVideoElement(src),
        loadPrecomputedDepth(depthSrc, depthMeta),
      ]);

      // Check if cancelled during loading
      if (signal.aborted) {
        video.remove();
        return;
      }

      this.video = video;
      this.loopCount = 0;
      this.attachVideoEventListeners(video);

      // Analyze depth data and derive optimal parallax parameters.
      // Runs once, synchronous, <5ms.
      const depthProfile = analyzeDepthFrames(
        depthData.frames,
        depthData.meta.width,
        depthData.meta.height,
      );
      const derivedParams = deriveParallaxParams(depthProfile);

      // Override precedence: explicit attributes > derived > calibrated defaults.
      // hasAttribute() distinguishes "user explicitly set it" from "using fallback".
      const parallaxStrength = this.hasAttribute('parallax-max')
        ? this.parallaxMax / Math.max(video.videoWidth, 1)
        : derivedParams.parallaxStrength;

      const overscanPadding = this.hasAttribute('overscan')
        ? this.overscan
        : derivedParams.overscanPadding;

      // Create depth interpolator — synchronous keyframe blending.
      // The bilateral filter now runs on the GPU as a dedicated shader
      // pass inside the renderer, so no Web Worker is needed.
      const interpolator = new DepthFrameInterpolator(depthData);
      const readDepth = (timeSec: number) => interpolator.sample(timeSec);

      // Detect GPU backend (WebGPU with WebGL2 fallback).
      const backend = await detectGPUBackend(this.gpuBackend);

      if (signal.aborted) return;

      // Create renderer with merged config: explicit overrides > derived > defaults.
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

      this.renderer.initialize(video, depthData.meta.width, depthData.meta.height);

      // Create input handler scoped to this element
      this.inputHandler = new ComponentInputHandler(this);

      // Start the render loop with axis multipliers applied
      const pxFactor = this.parallaxX;
      const pyFactor = this.parallaxY;

      this.renderer.start(
        video,
        readDepth,
        () => {
          if (!this.inputHandler) return { x: 0, y: 0 };
          const raw = this.inputHandler.update();
          return {
            x: raw.x * pxFactor,
            y: raw.y * pyFactor,
          };
        },
        // RVFC callback: dispatch 'frame' event on each new video frame
        (currentTime: number, frameNumber: number) => {
          this.emit<LayershiftFrameDetail>('layershift-parallax:frame', {
            currentTime,
            frameNumber,
          });
        }
      );

      // Start playback if autoplay is set
      if (this.shouldAutoplay) {
        video.currentTime = 0;
        try {
          await video.play();
        } catch {
          // Autoplay may be blocked by browser policy — not an error
        }
      }

      // Final abort check — video.play() is the last await, and abort
      // could fire during it (Strict Mode unmount). Don't mark as
      // initialized if the element was disconnected mid-init.
      if (signal.aborted) return;

      this.lifecycle.markInitialized();

      this.emit<LayershiftReadyDetail>('layershift-parallax:ready', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
        depthProfile,
        derivedParams,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize.';
      console.error('<layershift-parallax>: Failed to initialize.', err);
      this.emit<LayershiftErrorDetail>('layershift-parallax:error', { message });
    }
  }

  // --- Video element ---

  private async createVideoElement(url: string): Promise<HTMLVideoElement> {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.setAttribute('crossorigin', 'anonymous');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', 'true');
    video.muted = this.shouldMute;
    video.defaultMuted = this.shouldMute;
    if (this.shouldMute) video.setAttribute('muted', '');
    video.loop = this.shouldLoop;
    video.preload = 'auto';
    video.style.display = 'none';
    video.src = url;

    // Append to shadow DOM so it's contained
    this.shadow.appendChild(video);

    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      const onLoaded = () => { cleanup(); resolve(); };
      const onError = () => { cleanup(); reject(new Error('Failed to load video metadata.')); };
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoaded);
        video.removeEventListener('error', onError);
      };
      video.addEventListener('loadedmetadata', onLoaded);
      video.addEventListener('error', onError);
      video.load();
    });

    return video;
  }

  // --- Cleanup ---

  doDispose(): void {
    // Renderer.dispose() handles WebGL context release internally
    this.renderer?.dispose();
    this.renderer = null;

    this.inputHandler?.dispose();
    this.inputHandler = null;

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = null;
    }

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
