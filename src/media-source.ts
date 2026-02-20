/**
 * Unified media source abstraction.
 *
 * Provides a common interface over HTMLVideoElement, HTMLImageElement,
 * and MediaStream-backed video (camera) so that renderers and Web
 * Components can consume any visual source without branching.
 */

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export type MediaSourceType = 'video' | 'image' | 'camera';

export interface MediaSource {
  readonly type: MediaSourceType;
  readonly width: number;
  readonly height: number;
  readonly currentTime: number;
  /** True for video and camera (continuous frame stream). */
  readonly isLive: boolean;

  /** Return the underlying element suitable for texImage2D / copyExternalImageToTexture. */
  getImageSource(): CanvasImageSource | null;

  requestVideoFrameCallback?(cb: (now: number, metadata: VideoFrameCallbackMetadata) => void): number;
  cancelVideoFrameCallback?(handle: number): void;

  play?(): Promise<void>;
  pause?(): void;

  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;

  dispose(): void;
}

// ---------------------------------------------------------------------------
// Video source
// ---------------------------------------------------------------------------

export interface VideoSourceOptions {
  parent?: Node;
  loop?: boolean;
  muted?: boolean;
  autoplay?: boolean;
}

/**
 * Create a MediaSource backed by an HTMLVideoElement.
 *
 * The video is appended to `parent` (default: `document.body`) as a
 * hidden element and metadata is loaded before the promise resolves.
 */
export async function createVideoSource(
  url: string,
  options: VideoSourceOptions = {},
): Promise<MediaSource> {
  const {
    parent = document.body,
    loop = true,
    muted = true,
  } = options;

  const video = document.createElement('video');
  video.crossOrigin = 'anonymous';
  video.setAttribute('crossorigin', 'anonymous');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', 'true');
  video.muted = muted;
  video.defaultMuted = muted;
  if (muted) video.setAttribute('muted', '');
  video.loop = loop;
  video.preload = 'auto';
  video.style.display = 'none';
  video.src = url;

  parent.appendChild(video);
  await waitForMetadata(video);

  return new VideoSourceImpl(video);
}

class VideoSourceImpl implements MediaSource {
  readonly type: MediaSourceType = 'video';
  readonly isLive = true;

  constructor(private readonly video: HTMLVideoElement) {}

  get width(): number { return this.video.videoWidth; }
  get height(): number { return this.video.videoHeight; }
  get currentTime(): number { return this.video.currentTime; }

  getImageSource(): CanvasImageSource | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    return this.video;
  }

  requestVideoFrameCallback(cb: (now: number, metadata: VideoFrameCallbackMetadata) => void): number {
    return this.video.requestVideoFrameCallback(cb);
  }

  cancelVideoFrameCallback(handle: number): void {
    this.video.cancelVideoFrameCallback(handle);
  }

  play(): Promise<void> { return this.video.play(); }
  pause(): void { this.video.pause(); }

  addEventListener(type: string, listener: EventListener): void {
    this.video.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.video.removeEventListener(type, listener);
  }

  dispose(): void {
    this.video.pause();
    this.video.removeAttribute('src');
    this.video.load();
    this.video.remove();
  }
}

// ---------------------------------------------------------------------------
// Image source
// ---------------------------------------------------------------------------

export interface ImageSourceOptions {
  parent?: Node;
}

/**
 * Create a MediaSource backed by an HTMLImageElement.
 *
 * Static source — `currentTime` is always 0, `isLive` is false.
 * RVFC is not available; renderers fall back to RAF-only.
 */
export async function createImageSource(
  url: string,
  _options: ImageSourceOptions = {},
): Promise<MediaSource> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise<void>((resolve, reject) => {
    if (img.complete && img.naturalWidth > 0) { resolve(); return; }
    img.addEventListener('load', () => resolve(), { once: true });
    img.addEventListener('error', () => reject(new Error(`Failed to load image: ${url}`)), { once: true });
  });

  return new ImageSourceImpl(img);
}

class ImageSourceImpl implements MediaSource {
  readonly type: MediaSourceType = 'image';
  readonly isLive = false;
  readonly currentTime = 0;

  constructor(private readonly img: HTMLImageElement) {}

  get width(): number { return this.img.naturalWidth; }
  get height(): number { return this.img.naturalHeight; }

  getImageSource(): CanvasImageSource { return this.img; }

  dispose(): void {
    this.img.removeAttribute('src');
  }
}

// ---------------------------------------------------------------------------
// Camera source
// ---------------------------------------------------------------------------

export interface CameraSourceOptions {
  parent?: Node;
}

/**
 * Create a MediaSource backed by a camera stream (getUserMedia).
 *
 * Live source — `currentTime` ticks with the stream, `isLive` is true.
 * RVFC is available on the underlying video element.
 */
export async function createCameraSource(
  constraints: MediaStreamConstraints = { video: true },
  options: CameraSourceOptions = {},
): Promise<MediaSource> {
  const { parent = document.body } = options;

  const stream = await navigator.mediaDevices.getUserMedia(constraints);

  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.muted = true;
  video.defaultMuted = true;
  video.style.display = 'none';
  video.srcObject = stream;

  parent.appendChild(video);
  await waitForMetadata(video);
  await video.play();

  return new CameraSourceImpl(video, stream);
}

class CameraSourceImpl implements MediaSource {
  readonly type: MediaSourceType = 'camera';
  readonly isLive = true;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly stream: MediaStream,
  ) {}

  get width(): number { return this.video.videoWidth; }
  get height(): number { return this.video.videoHeight; }
  get currentTime(): number { return this.video.currentTime; }

  getImageSource(): CanvasImageSource | null {
    if (this.video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
    return this.video;
  }

  requestVideoFrameCallback(cb: (now: number, metadata: VideoFrameCallbackMetadata) => void): number {
    return this.video.requestVideoFrameCallback(cb);
  }

  cancelVideoFrameCallback(handle: number): void {
    this.video.cancelVideoFrameCallback(handle);
  }

  play(): Promise<void> { return this.video.play(); }
  pause(): void { this.video.pause(); }

  addEventListener(type: string, listener: EventListener): void {
    this.video.addEventListener(type, listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.video.removeEventListener(type, listener);
  }

  dispose(): void {
    this.video.pause();
    this.video.srcObject = null;
    this.video.remove();
    for (const track of this.stream.getTracks()) {
      track.stop();
    }
  }
}

// ---------------------------------------------------------------------------
// Factory dispatcher
// ---------------------------------------------------------------------------

/**
 * Convenience factory that dispatches to the correct source creator
 * based on `sourceType`.
 */
export function createMediaSource(
  src: string,
  sourceType: MediaSourceType,
  options?: VideoSourceOptions & CameraSourceOptions & { cameraConstraints?: MediaStreamConstraints },
): Promise<MediaSource> {
  switch (sourceType) {
    case 'video':
      return createVideoSource(src, options);
    case 'image':
      return createImageSource(src, options);
    case 'camera':
      return createCameraSource(options?.cameraConstraints, options);
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return;

  await new Promise<void>((resolve, reject) => {
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
}
