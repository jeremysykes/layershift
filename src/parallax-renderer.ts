import * as THREE from 'three';
import type { ParallaxInput } from './input-handler';
import type { LayerTextureSet } from './layer-decomposer';

export class ParallaxRenderer {
  private static readonly RESIZE_DEBOUNCE_MS = 100;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly container: HTMLElement;
  private textures: THREE.DataTexture[] = [];
  private meshes: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private frameWidth = 1;
  private frameHeight = 1;
  private playbackVideo: HTMLVideoElement | null = null;
  private readLayerFrame: (() => LayerTextureSet | null) | null = null;
  private readParallaxInput: (() => ParallaxInput) | null = null;
  private animationFrameHandle = 0;
  private activeFrameIndex = -1;
  private resizeObserver: ResizeObserver | null = null;
  private resizeTimer: number | null = null;
  private currentPlaneWidth = 1;
  private currentPlaneHeight = 1;

  constructor(
    parent: HTMLElement,
    private readonly layerCount: number,
    private readonly maxOffsetPx: number,
    private readonly overscanPadding: number
  ) {
    this.container = parent;

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
    readLayerFrame: () => LayerTextureSet | null,
    readParallaxInput: () => ParallaxInput
  ): void {
    this.stop();

    this.playbackVideo = video;
    this.readLayerFrame = readLayerFrame;
    this.readParallaxInput = readParallaxInput;
    this.activeFrameIndex = -1;

    this.animationFrameHandle = window.requestAnimationFrame(this.renderLoop);
  }

  stop(): void {
    if (this.animationFrameHandle) {
      window.cancelAnimationFrame(this.animationFrameHandle);
      this.animationFrameHandle = 0;
    }
    this.playbackVideo = null;
    this.readLayerFrame = null;
    this.readParallaxInput = null;
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

    if (!this.playbackVideo) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const frame = this.readLayerFrame?.() ?? null;
    if (frame && frame.index !== this.activeFrameIndex) {
      this.applyFrame(frame);
      this.activeFrameIndex = frame.index;
    }

    if (this.readParallaxInput) {
      this.applyParallax(this.readParallaxInput());
    }

    this.renderer.render(this.scene, this.camera);
  };

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

    const horizontalOverscanPerSide =
      viewportWidth * (this.maxOffsetPx / viewportWidth + this.overscanPadding);
    const verticalOverscanPerSide =
      viewportHeight * (this.maxOffsetPx / viewportHeight + this.overscanPadding);

    return {
      planeWidth: coverWidth + horizontalOverscanPerSide * 2,
      planeHeight: coverHeight + verticalOverscanPerSide * 2,
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
