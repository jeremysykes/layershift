/**
 * <layershift-portal> Web Component
 *
 * A self-contained Custom Element that renders video through a logo-shaped
 * portal with depth-aware parallax, emissive interior compositing, geometric
 * chamfer lighting, and dimensional boundary effects. Encapsulates the
 * multi-pass WebGL 2 stencil + FBO pipeline inside a Shadow DOM.
 *
 * Usage:
 *   <layershift-portal
 *     src="video.mp4"
 *     depth-src="depth-data.bin"
 *     depth-meta="depth-meta.json"
 *     logo-src="logo.svg"
 *   ></layershift-portal>
 */

import {
  type PrecomputedDepthData,
  DepthFrameInterpolator,
  WorkerDepthInterpolator,
  loadPrecomputedDepth,
} from '../../precomputed-depth';
import { PortalRenderer, type PortalRendererConfig } from '../../portal-renderer';
import { generateMeshFromSVG, type ShapeMesh } from '../../shape-generator';
import type { ParallaxInput } from '../../input-handler';
import type {
  LayershiftPortalReadyDetail,
  LayershiftPortalPlayDetail,
  LayershiftPortalPauseDetail,
  LayershiftPortalLoopDetail,
  LayershiftPortalFrameDetail,
  LayershiftPortalErrorDetail,
} from './types';

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULTS = {
  parallaxX: 0.4,
  parallaxY: 0.8,
  parallaxMax: 30,
  overscan: 0.06,
  pomSteps: 16,
  // Boundary effects
  rimIntensity: 0.6,
  rimColor: '#ffffff',
  rimWidth: 0.025,
  refractionStrength: 0.015,
  chromaticStrength: 0.008,
  occlusionIntensity: 0.4,
  // Lens transform
  depthPower: 0.7,   // < 1 = wide-angle, exaggerated foreground
  depthScale: 1.2,   // expand depth range beyond 1.0
  depthBias: -0.05,  // slight bias toward near
  // Interior mood
  fogDensity: 0.15,
  fogColor: '#1a1a2e',
  colorShift: 0.6,
  brightnessBias: 0.05,
  // Depth-adaptive
  contrastLow: 0.02,
  contrastHigh: 0.98,
  verticalReduction: 0.5,
  dofStart: 0.5,
  dofStrength: 0.5,
  // Bevel / dimensional typography
  bevelIntensity: 0.5,
  bevelWidth: 0.04,
  bevelDarkening: 0.2,
  bevelDesaturation: 0.12,
  bevelLightAngle: 135,
  // Volumetric edge wall
  edgeThickness: 0.01,
  edgeSpecular: 0.35,
  edgeColor: '#a0a0a0',
  // Chamfer geometry
  chamferWidth: 0.025,
  chamferAngle: 45,
  chamferColor: '#262630',
  chamferAmbient: 0.12,
  chamferSpecular: 0.3,
  chamferShininess: 24,
  // Edge occlusion (emissive interior)
  edgeOcclusionWidth: 0.03,
  edgeOcclusionStrength: 0.2,
  lightDirection: '-0.5,0.7,-0.3',
  autoplay: true,
  loop: true,
  muted: true,
} as const;

// ---------------------------------------------------------------------------
// Input handler (reused from layershift-element.ts — same logic)
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
      } catch { return; }
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

export class LayershiftPortalElement extends HTMLElement {
  static readonly TAG_NAME = 'layershift-portal';

  static get observedAttributes(): string[] {
    return [
      'src', 'depth-src', 'depth-meta', 'logo-src',
      'parallax-x', 'parallax-y', 'parallax-max', 'overscan', 'pom-steps',
      'rim-intensity', 'rim-color', 'rim-width',
      'refraction-strength', 'chromatic-strength', 'occlusion-intensity',
      'depth-power', 'depth-scale', 'depth-bias',
      'fog-density', 'fog-color', 'color-shift', 'brightness-bias',
      'contrast-low', 'contrast-high', 'vertical-reduction',
      'dof-start', 'dof-strength',
      'bevel-intensity', 'bevel-width', 'bevel-darkening', 'bevel-desaturation',
      'bevel-light-angle',
      'edge-thickness', 'edge-specular', 'edge-color',
      'chamfer-width', 'chamfer-angle', 'chamfer-color',
      'chamfer-ambient', 'chamfer-specular', 'chamfer-shininess',
      'edge-occlusion-width', 'edge-occlusion-strength',
      'light-direction',
      'autoplay', 'loop', 'muted',
    ];
  }

  private shadow: ShadowRoot;
  private container: HTMLDivElement | null = null;
  private renderer: PortalRenderer | null = null;
  private inputHandler: ComponentInputHandler | null = null;
  private depthWorker: WorkerDepthInterpolator | null = null;
  private video: HTMLVideoElement | null = null;
  private mesh: ShapeMesh | null = null;
  private initialized = false;
  private abortController: AbortController | null = null;
  private loopCount = 0;

  constructor() {
    super();
    this.shadow = this.attachShadow({ mode: 'open' });
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

  private getAttrColor(name: string, fallback: string): [number, number, number] {
    const val = this.getAttribute(name) ?? fallback;
    return parseColor(val);
  }

  private getAttrVec3(name: string, fallback: string): [number, number, number] {
    const val = this.getAttribute(name) ?? fallback;
    const parts = val.split(',').map(s => parseFloat(s.trim()));
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      return [parts[0], parts[1], parts[2]];
    }
    const fb = fallback.split(',').map(s => parseFloat(s.trim()));
    return [fb[0], fb[1], fb[2]];
  }

  private get parallaxX(): number { return this.getAttrFloat('parallax-x', DEFAULTS.parallaxX); }
  private get parallaxY(): number { return this.getAttrFloat('parallax-y', DEFAULTS.parallaxY); }
  private get parallaxMax(): number { return this.getAttrFloat('parallax-max', DEFAULTS.parallaxMax); }
  private get overscan(): number { return this.getAttrFloat('overscan', DEFAULTS.overscan); }
  private get pomSteps(): number { return this.getAttrFloat('pom-steps', DEFAULTS.pomSteps); }
  // Boundary
  private get rimIntensity(): number { return this.getAttrFloat('rim-intensity', DEFAULTS.rimIntensity); }
  private get rimWidth(): number { return this.getAttrFloat('rim-width', DEFAULTS.rimWidth); }
  private get rimColor(): [number, number, number] { return this.getAttrColor('rim-color', DEFAULTS.rimColor); }
  private get refractionStrength(): number { return this.getAttrFloat('refraction-strength', DEFAULTS.refractionStrength); }
  private get chromaticStrength(): number { return this.getAttrFloat('chromatic-strength', DEFAULTS.chromaticStrength); }
  private get occlusionIntensity(): number { return this.getAttrFloat('occlusion-intensity', DEFAULTS.occlusionIntensity); }
  // Lens transform
  private get depthPower(): number { return this.getAttrFloat('depth-power', DEFAULTS.depthPower); }
  private get depthScale(): number { return this.getAttrFloat('depth-scale', DEFAULTS.depthScale); }
  private get depthBias(): number { return this.getAttrFloat('depth-bias', DEFAULTS.depthBias); }
  // Interior mood
  private get fogDensity(): number { return this.getAttrFloat('fog-density', DEFAULTS.fogDensity); }
  private get fogColor(): [number, number, number] { return this.getAttrColor('fog-color', DEFAULTS.fogColor); }
  private get colorShift(): number { return this.getAttrFloat('color-shift', DEFAULTS.colorShift); }
  private get brightnessBias(): number { return this.getAttrFloat('brightness-bias', DEFAULTS.brightnessBias); }
  // Depth-adaptive
  private get contrastLow(): number { return this.getAttrFloat('contrast-low', DEFAULTS.contrastLow); }
  private get contrastHigh(): number { return this.getAttrFloat('contrast-high', DEFAULTS.contrastHigh); }
  private get verticalReduction(): number { return this.getAttrFloat('vertical-reduction', DEFAULTS.verticalReduction); }
  private get dofStart(): number { return this.getAttrFloat('dof-start', DEFAULTS.dofStart); }
  private get dofStrength(): number { return this.getAttrFloat('dof-strength', DEFAULTS.dofStrength); }
  // Bevel / dimensional typography
  private get bevelIntensity(): number { return this.getAttrFloat('bevel-intensity', DEFAULTS.bevelIntensity); }
  private get bevelWidth(): number { return this.getAttrFloat('bevel-width', DEFAULTS.bevelWidth); }
  private get bevelDarkening(): number { return this.getAttrFloat('bevel-darkening', DEFAULTS.bevelDarkening); }
  private get bevelDesaturation(): number { return this.getAttrFloat('bevel-desaturation', DEFAULTS.bevelDesaturation); }
  private get bevelLightAngle(): number { return this.getAttrFloat('bevel-light-angle', DEFAULTS.bevelLightAngle); }
  // Volumetric edge wall
  private get edgeThickness(): number { return this.getAttrFloat('edge-thickness', DEFAULTS.edgeThickness); }
  private get edgeSpecular(): number { return this.getAttrFloat('edge-specular', DEFAULTS.edgeSpecular); }
  private get edgeColor(): [number, number, number] { return this.getAttrColor('edge-color', DEFAULTS.edgeColor); }
  // Chamfer geometry
  private get chamferWidth(): number { return this.getAttrFloat('chamfer-width', DEFAULTS.chamferWidth); }
  private get chamferAngle(): number { return this.getAttrFloat('chamfer-angle', DEFAULTS.chamferAngle); }
  private get chamferColor(): [number, number, number] { return this.getAttrColor('chamfer-color', DEFAULTS.chamferColor); }
  private get chamferAmbient(): number { return this.getAttrFloat('chamfer-ambient', DEFAULTS.chamferAmbient); }
  private get chamferSpecular(): number { return this.getAttrFloat('chamfer-specular', DEFAULTS.chamferSpecular); }
  private get chamferShininess(): number { return this.getAttrFloat('chamfer-shininess', DEFAULTS.chamferShininess); }
  // Edge occlusion
  private get edgeOcclusionWidth(): number { return this.getAttrFloat('edge-occlusion-width', DEFAULTS.edgeOcclusionWidth); }
  private get edgeOcclusionStrength(): number { return this.getAttrFloat('edge-occlusion-strength', DEFAULTS.edgeOcclusionStrength); }
  private get lightDirection3(): [number, number, number] { return this.getAttrVec3('light-direction', DEFAULTS.lightDirection); }
  private get shouldAutoplay(): boolean { return this.getAttrBool('autoplay', DEFAULTS.autoplay); }
  private get shouldLoop(): boolean { return this.getAttrBool('loop', DEFAULTS.loop); }
  private get shouldMute(): boolean { return this.getAttrBool('muted', DEFAULTS.muted); }

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

  private attachVideoEventListeners(video: HTMLVideoElement): void {
    video.addEventListener('play', () => {
      this.emit<LayershiftPortalPlayDetail>('layershift-portal:play', {
        currentTime: video.currentTime,
      });
    });

    video.addEventListener('pause', () => {
      this.emit<LayershiftPortalPauseDetail>('layershift-portal:pause', {
        currentTime: video.currentTime,
      });
    });

    video.addEventListener('ended', () => {
      if (video.loop) {
        this.loopCount += 1;
        this.emit<LayershiftPortalLoopDetail>('layershift-portal:loop', {
          loopCount: this.loopCount,
        });
      }
    });
  }

  // --- Lifecycle ---

  connectedCallback(): void {
    this.setupShadowDOM();
    void this.init();
  }

  disconnectedCallback(): void {
    this.dispose();
  }

  attributeChangedCallback(_name: string, _oldVal: string | null, _newVal: string | null): void {
    const reinitAttrs = ['src', 'depth-src', 'depth-meta', 'logo-src'];
    if (!reinitAttrs.includes(_name)) return;

    if (this.initialized) {
      this.dispose();
      this.setupShadowDOM();
      void this.init();
    } else if (
      this.isConnected &&
      this.getAttribute('src') &&
      this.getAttribute('depth-src') &&
      this.getAttribute('depth-meta') &&
      this.getAttribute('logo-src')
    ) {
      void this.init();
    }
  }

  // --- Shadow DOM ---

  private setupShadowDOM(): void {
    this.shadow.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      :host {
        display: block;
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
        background: transparent;
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

  private async init(): Promise<void> {
    const src = this.getAttribute('src');
    const depthSrc = this.getAttribute('depth-src');
    const depthMeta = this.getAttribute('depth-meta');
    const logoSrc = this.getAttribute('logo-src');

    if (!src || !depthSrc || !depthMeta || !logoSrc) {
      const message = 'src, depth-src, depth-meta, and logo-src attributes are required.';
      console.warn(`<layershift-portal>: ${message}`);
      this.emit<LayershiftPortalErrorDetail>('layershift-portal:error', { message });
      return;
    }

    if (!this.container) return;

    this.abortController = new AbortController();

    try {
      // Load video, depth data, and SVG mesh in parallel
      const [video, depthData, mesh] = await Promise.all([
        this.createVideoElement(src),
        loadPrecomputedDepth(depthSrc, depthMeta),
        generateMeshFromSVG(logoSrc),
      ]);

      // Check if disconnected during loading (abortController is nulled by dispose)
      if (!this.abortController || this.abortController.signal.aborted) {
        video.remove();
        return;
      }

      this.video = video;
      this.mesh = mesh;
      this.loopCount = 0;
      this.attachVideoEventListeners(video);

      // Compute parallax strength from parallax-max attribute
      const parallaxStrength = this.parallaxMax / Math.max(video.videoWidth, 1);

      // Create depth interpolator
      let readDepth: (timeSec: number) => Uint8Array;
      try {
        const workerInterpolator = await WorkerDepthInterpolator.create(
          depthData,
          depthData.meta.width,
          depthData.meta.height
        );
        this.depthWorker = workerInterpolator;
        readDepth = (timeSec: number) => workerInterpolator.sample(timeSec);
      } catch {
        const syncInterpolator = new DepthFrameInterpolator(
          depthData,
          depthData.meta.width,
          depthData.meta.height
        );
        readDepth = (timeSec: number) => syncInterpolator.sample(timeSec);
      }

      if (!this.abortController || this.abortController.signal.aborted) {
        video.remove();
        this.depthWorker?.dispose();
        this.depthWorker = null;
        return;
      }

      // Create renderer
      const config: PortalRendererConfig = {
        parallaxStrength,
        overscanPadding: this.overscan,
        pomSteps: this.pomSteps,
        // Boundary
        rimLightIntensity: this.rimIntensity,
        rimLightColor: this.rimColor,
        rimLightWidth: this.rimWidth,
        refractionStrength: this.refractionStrength,
        chromaticStrength: this.chromaticStrength,
        occlusionIntensity: this.occlusionIntensity,
        // Lens transform
        depthPower: this.depthPower,
        depthScale: this.depthScale,
        depthBias: this.depthBias,
        // Interior mood
        fogDensity: this.fogDensity,
        fogColor: this.fogColor,
        colorShift: this.colorShift,
        brightnessBias: this.brightnessBias,
        // Depth-adaptive
        contrastLow: this.contrastLow,
        contrastHigh: this.contrastHigh,
        verticalReduction: this.verticalReduction,
        dofStart: this.dofStart,
        dofStrength: this.dofStrength,
        // Bevel / dimensional typography
        bevelIntensity: this.bevelIntensity,
        bevelWidth: this.bevelWidth,
        bevelDarkening: this.bevelDarkening,
        bevelDesaturation: this.bevelDesaturation,
        bevelLightAngle: this.bevelLightAngle,
        // Volumetric edge wall
        edgeThickness: this.edgeThickness,
        edgeSpecular: this.edgeSpecular,
        edgeColor: this.edgeColor,
        // Chamfer geometry
        chamferWidth: this.chamferWidth,
        chamferAngle: this.chamferAngle,
        chamferColor: this.chamferColor,
        chamferAmbient: this.chamferAmbient,
        chamferSpecular: this.chamferSpecular,
        chamferShininess: this.chamferShininess,
        // Edge occlusion
        edgeOcclusionWidth: this.edgeOcclusionWidth,
        edgeOcclusionStrength: this.edgeOcclusionStrength,
        lightDirection: this.lightDirection3,
      };

      this.renderer = new PortalRenderer(this.container!, config);
      this.renderer.initialize(video, depthData.meta.width, depthData.meta.height, mesh);

      // Create input handler scoped to this element
      this.inputHandler = new ComponentInputHandler(this);

      // Start render loop with axis multipliers
      const pxFactor = this.parallaxX;
      const pyFactor = this.parallaxY;

      this.renderer.start(
        video,
        readDepth,
        () => {
          if (!this.inputHandler) return { x: 0, y: 0 };
          const raw = this.inputHandler.update();
          return { x: raw.x * pxFactor, y: raw.y * pyFactor };
        },
        (currentTime: number, frameNumber: number) => {
          this.emit<LayershiftPortalFrameDetail>('layershift-portal:frame', {
            currentTime,
            frameNumber,
          });
        }
      );

      // Autoplay
      if (this.shouldAutoplay) {
        video.currentTime = 0;
        try { await video.play(); } catch { /* Autoplay blocked */ }
      }

      this.initialized = true;

      this.emit<LayershiftPortalReadyDetail>('layershift-portal:ready', {
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: video.duration,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to initialize.';
      console.error('<layershift-portal>: Failed to initialize.', err);
      this.emit<LayershiftPortalErrorDetail>('layershift-portal:error', { message });
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

  private dispose(): void {
    this.abortController?.abort();
    this.abortController = null;

    this.renderer?.dispose();
    this.renderer = null;

    this.inputHandler?.dispose();
    this.inputHandler = null;

    this.depthWorker?.dispose();
    this.depthWorker = null;

    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.load();
      this.video.remove();
      this.video = null;
    }

    this.mesh = null;
    this.initialized = false;
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

/** Parse a CSS color string (#rrggbb or #rgb) to [r, g, b] in 0-1 range. */
function parseColor(color: string): [number, number, number] {
  const hex = color.replace('#', '');
  if (hex.length === 3) {
    const r = parseInt(hex[0] + hex[0], 16) / 255;
    const g = parseInt(hex[1] + hex[1], 16) / 255;
    const b = parseInt(hex[2] + hex[2], 16) / 255;
    return [r, g, b];
  }
  if (hex.length === 6) {
    const r = parseInt(hex.substring(0, 2), 16) / 255;
    const g = parseInt(hex.substring(2, 4), 16) / 255;
    const b = parseInt(hex.substring(4, 6), 16) / 255;
    return [r, g, b];
  }
  return [0, 0, 0]; // fallback to black
}
