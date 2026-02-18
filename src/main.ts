/**
 * Application entry point — wires together the depth-aware parallax pipeline.
 *
 * ## Boot sequence
 *
 * 1. Load the <video> element and precomputed depth data in parallel.
 * 2. Create a DepthFrameInterpolator to smoothly sample between the
 *    5fps precomputed depth keyframes at any playback time.
 * 3. Initialize the ParallaxRenderer with the video element (for
 *    VideoTexture) and the depth map dimensions.
 * 4. Start the render loop: each frame, the renderer asks the
 *    interpolator for the current depth map and the InputHandler
 *    for the current mouse/gyro offset, then the GPU shader does
 *    per-pixel UV displacement.
 * 5. Register spacebar for play/pause and (on mobile) show a motion
 *    permission button.
 *
 * ## What changed from the old layer-based system
 *
 * - No more canvas getImageData / createVideoFrameSampler — the GPU
 *   samples the video at native resolution via THREE.VideoTexture.
 * - No more decomposeFrameToLayers — depth is used continuously in
 *   the fragment shader instead of being quantized into 5 layers.
 * - The renderer receives a depth callback instead of a layer callback.
 */

import './style.css';
import { APP_CONFIG } from './config';
import { InputHandler } from './input-handler';
import { ParallaxRenderer } from './parallax-renderer';
import {
  type BinaryDownloadProgress,
  DepthFrameInterpolator,
  WorkerDepthInterpolator,
  loadPrecomputedDepth,
} from './precomputed-depth';
import { UIController } from './ui';
import { createHiddenVideoElement } from './video-source';

// ---------------------------------------------------------------------------
// Application setup
// ---------------------------------------------------------------------------

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Application root element (#app) is missing.');
}

const ui = new UIController(app);
const input = new InputHandler(APP_CONFIG.motionLerpFactor);

// The renderer now takes a config object instead of individual layer params.
const renderer = new ParallaxRenderer(app, {
  parallaxStrength: APP_CONFIG.parallaxStrength,
  pomEnabled: APP_CONFIG.pomEnabled,
  pomSteps: APP_CONFIG.pomSteps,
  overscanPadding: APP_CONFIG.overscanPadding,
});

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unexpected error while starting app.';
  console.error(error);
  ui.showError(message);
  ui.setLoadingProgress(0, 'Failed to initialize precomputed depth pipeline.');
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function bootstrap(): Promise<void> {
  ui.setLoadingProgress(0.01, 'Loading video metadata and depth data...');

  // Load the video element and binary depth data concurrently.
  const videoPromise = createHiddenVideoElement(APP_CONFIG.videoUrl);
  const depthDataPromise = loadPrecomputedDepth(
    APP_CONFIG.depthDataUrl,
    APP_CONFIG.depthMetaUrl,
    (progress) => {
      ui.setLoadingProgress(progress.fraction, formatDepthDownloadLabel(progress));
    }
  );

  const [video, depthData] = await Promise.all([videoPromise, depthDataPromise]);

  // Create depth interpolator — try Web Worker first for smooth playback
  // (bilateral filter off main thread), fall back to synchronous if
  // Workers aren't available (e.g. file:// protocol, strict CSP).
  let readDepth: (timeSec: number) => Uint8Array;
  let workerInterpolator: WorkerDepthInterpolator | null = null;
  try {
    workerInterpolator = await WorkerDepthInterpolator.create(
      depthData,
      depthData.meta.width,
      depthData.meta.height
    );
    readDepth = (timeSec: number) => workerInterpolator!.sample(timeSec);
  } catch {
    // Worker unavailable — fall back to main-thread processing
    const syncInterpolator = new DepthFrameInterpolator(
      depthData,
      depthData.meta.width,
      depthData.meta.height
    );
    readDepth = (timeSec: number) => syncInterpolator.sample(timeSec);
  }

  // Initialize the renderer with the video element (for VideoTexture)
  // and the depth map dimensions (for the depth DataTexture).
  renderer.initialize(video, depthData.meta.width, depthData.meta.height);

  // Start the render loop. The renderer calls these callbacks each frame:
  //   readDepth(timeSec) → Uint8Array of depth values [0=near, 255=far]
  //   readInput()        → { x, y } parallax offset in [-1, 1]
  renderer.start(
    video,
    readDepth,
    () => input.update()
  );

  video.currentTime = 0;

  ui.hideLoading();
  configureSpacebarToggle(video);
  configureMotionPermissionFlow();

  window.addEventListener('beforeunload', () => {
    renderer.dispose();
    input.dispose();
    workerInterpolator?.dispose();
    video.remove();
  });
}

// ---------------------------------------------------------------------------
// Spacebar play/pause
// ---------------------------------------------------------------------------

function configureSpacebarToggle(video: HTMLVideoElement): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    e.preventDefault();
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  });
}

// ---------------------------------------------------------------------------
// Motion permission (iOS requires user gesture for DeviceOrientation)
// ---------------------------------------------------------------------------

function configureMotionPermissionFlow(): void {
  if (!input.isMotionSupported) {
    return;
  }

  ui.showMotionButton(true);
  ui.onMotionButtonClick(async () => {
    ui.setMotionButtonLabel('Requesting motion permission...');
    const enabled = await input.enableMotionControls();

    if (enabled) {
      ui.setMotionButtonLabel('Motion enabled');
      window.setTimeout(() => ui.showMotionButton(false), 1200);
    } else {
      ui.setMotionButtonLabel('Motion denied (mouse input still active)');
    }
  });
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function formatDepthDownloadLabel(progress: BinaryDownloadProgress): string {
  if (progress.totalBytes && progress.totalBytes > 0) {
    return `Downloading depth data ${formatBytes(progress.receivedBytes)} / ${formatBytes(progress.totalBytes)}`;
  }
  return `Downloading depth data ${formatBytes(progress.receivedBytes)}`;
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = units[0];

  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}${unit}`;
}
