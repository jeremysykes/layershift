import * as THREE from 'three';
import type { ParallaxInput } from './input-handler';
import type { LayerTextureSet } from './layer-decomposer';

class LayerFrameRingBuffer {
  private readonly entries = new Map<number, LayerTextureSet>();

  constructor(readonly capacity: number) {}

  clear(): void {
    this.entries.clear();
  }

  get(index: number): LayerTextureSet | undefined {
    return this.entries.get(index);
  }

  set(index: number, frame: LayerTextureSet): void {
    if (this.entries.has(index)) {
      return;
    }

    this.entries.set(index, frame);
    if (this.entries.size <= this.capacity) {
      return;
    }

    const oldestKey = this.entries.keys().next().value as number | undefined;
    if (oldestKey !== undefined) {
      this.entries.delete(oldestKey);
    }
  }

  pruneOutside(minInclusive: number, maxInclusive: number): void {
    for (const key of this.entries.keys()) {
      if (key < minInclusive || key > maxInclusive) {
        this.entries.delete(key);
      }
    }
  }
}

export class ParallaxRenderer {
  private static readonly RESIZE_DEBOUNCE_MS = 100;
  private static readonly OVERSCAN_MULTIPLIER = 1.15;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly frameCache: LayerFrameRingBuffer;
  private readonly container: HTMLElement;
  private textures: THREE.DataTexture[] = [];
  private meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private frameWidth = 1;
  private frameHeight = 1;
  private frameSets: LayerTextureSet[] = [];
  private playbackVideo: HTMLVideoElement | null = null;
  private readParallaxInput: (() => ParallaxInput) | null = null;
  private animationFrameHandle = 0;
  private activeFrameIndex = -1;
  private fps = 12;
  private lagFrames = 0;
  private lastTimeSec = 0;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;
  private currentPlaneWidth = 1;
  private currentPlaneHeight = 1;

  constructor(
    parent: HTMLElement,
    private readonly layerCount: number,
    private readonly maxOffsetPx: number,
    ringBufferSize: number
  ) {
    this.container = parent;
    this.frameCache = new LayerFrameRingBuffer(ringBufferSize);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 1);

    this.container.appendChild(this.renderer.domElement);
    this.setupResizeHandling();
  }

  initialize(width: number, height: number): void {
    this.disposeSceneLayers();

    this.frameWidth = width;
    this.frameHeight = height;
    this.currentPlaneWidth = 0;
    this.currentPlaneHeight = 0;

    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const empty = new Uint8Array(width * height * 4);
      const texture = new THREE.DataTexture(
        empty,
        width,
        height,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      );
      texture.flipY = true;
      texture.magFilter = THREE.LinearFilter;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;

      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
      });

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
      mesh.renderOrder = layerIndex;
      mesh.position.z = -layerIndex * 0.1;

      this.scene.add(mesh);
      this.textures.push(texture);
      this.meshes.push(mesh);
    }

    this.recalculateViewportLayout();
  }

  start(
    video: HTMLVideoElement,
    frameSets: LayerTextureSet[],
    fps: number,
    lagFrames: number,
    readParallaxInput: () => ParallaxInput
  ): void {
    this.stop();

    this.playbackVideo = video;
    this.frameSets = frameSets;
    this.fps = fps;
    this.lagFrames = lagFrames;
    this.readParallaxInput = readParallaxInput;
    this.activeFrameIndex = -1;
    this.lastTimeSec = 0;
    this.frameCache.clear();

    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
  }

  stop(): void {
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
  }

  dispose(): void {
    this.stop();
    this.disposeSceneLayers();
    this.renderer.dispose();
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

  private readonly renderLoop = () => {
    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);

    if (!this.playbackVideo || this.frameSets.length === 0) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const targetIndex = this.resolveFrameIndex(this.playbackVideo.currentTime);
    this.ensureBufferedWindow(targetIndex);

    const frame = this.frameCache.get(targetIndex) ?? this.frameSets[targetIndex];
    if (frame && targetIndex !== this.activeFrameIndex) {
      this.applyFrame(frame);
      this.activeFrameIndex = targetIndex;
    }

    if (this.readParallaxInput) {
      this.applyParallax(this.readParallaxInput());
    }

    this.renderer.render(this.scene, this.camera);
  };

  private resolveFrameIndex(timeSec: number): number {
    if (this.frameSets.length === 0) {
      return 0;
    }

    if (timeSec < this.lastTimeSec) {
      this.activeFrameIndex = -1;
      this.frameCache.clear();
    }
    this.lastTimeSec = timeSec;

    const delayedFrame = Math.floor(timeSec * this.fps) - this.lagFrames;
    return clamp(delayedFrame, 0, this.frameSets.length - 1);
  }

  private ensureBufferedWindow(startIndex: number): void {
    const endIndex = clamp(startIndex + (this.frameCache.capacity - 1), 0, this.frameSets.length - 1);

    for (let index = startIndex; index <= endIndex; index += 1) {
      this.frameCache.set(index, this.frameSets[index]);
    }

    this.frameCache.pruneOutside(startIndex, endIndex);
  }

  private applyFrame(frame: LayerTextureSet): void {
    for (let layerIndex = 0; layerIndex < this.layerCount; layerIndex += 1) {
      const texture = this.textures[layerIndex];
      const layer = frame.layers[layerIndex];

      if (!texture || !layer) {
        continue;
      }

      texture.image.data = layer;
      texture.needsUpdate = true;
    }
  }

  private applyParallax(input: ParallaxInput): void {
    for (let layerIndex = 0; layerIndex < this.meshes.length; layerIndex += 1) {
      const mesh = this.meshes[layerIndex];
      const depthRatio =
        this.meshes.length > 1 ? layerIndex / (this.meshes.length - 1) : 0;
      const offset = this.maxOffsetPx * depthRatio;

      mesh.position.x = -input.x * offset;
      mesh.position.y = input.y * offset;
    }
  }

  private setupResizeHandling(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.scheduleResizeRecalculate();
      });
      this.resizeObserver.observe(this.container);
    }

    window.addEventListener('resize', this.scheduleResizeRecalculate);
    this.recalculateViewportLayout();
  }

  private readonly scheduleResizeRecalculate = () => {
    if (this.resizeTimer !== null) {
      window.clearTimeout(this.resizeTimer);
    }
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.recalculateViewportLayout();
    }, ParallaxRenderer.RESIZE_DEBOUNCE_MS);
  };

  private recalculateViewportLayout(): void {
    const { width, height } = this.getViewportSize();

    this.renderer.setSize(width, height, false);
    this.camera.left = -width / 2;
    this.camera.right = width / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.position.z = 1;
    this.camera.updateProjectionMatrix();

    const { planeWidth, planeHeight } = this.computeCoverPlaneSize(width, height);
    if (
      Math.abs(this.currentPlaneWidth - planeWidth) < 0.5 &&
      Math.abs(this.currentPlaneHeight - planeHeight) < 0.5
    ) {
      return;
    }
    this.currentPlaneWidth = planeWidth;
    this.currentPlaneHeight = planeHeight;

    for (const mesh of this.meshes) {
      const oldGeometry = mesh.geometry;
      mesh.geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
      oldGeometry.dispose();
    }
  }

  private getViewportSize(): { width: number; height: number } {
    const width = Math.max(1, Math.round(this.container.clientWidth || window.innerWidth));
    const height = Math.max(1, Math.round(this.container.clientHeight || window.innerHeight));
    return { width, height };
  }

  private computeCoverPlaneSize(
    viewportWidth: number,
    viewportHeight: number
  ): { planeWidth: number; planeHeight: number } {
    const sourceAspect = this.frameWidth / this.frameHeight;
    const viewportAspect = viewportWidth / viewportHeight;

    let coverWidth = viewportWidth;
    let coverHeight = viewportHeight;
    if (viewportAspect > sourceAspect) {
      coverHeight = viewportWidth / sourceAspect;
    } else {
      coverWidth = viewportHeight * sourceAspect;
    }

    const overscan = this.maxOffsetPx * ParallaxRenderer.OVERSCAN_MULTIPLIER;
    return {
      planeWidth: coverWidth + overscan * 2,
      planeHeight: coverHeight + overscan * 2,
    };
  }

  private disposeSceneLayers(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }

    for (const texture of this.textures) {
      texture.dispose();
    }

    this.meshes = [];
    this.textures = [];
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
