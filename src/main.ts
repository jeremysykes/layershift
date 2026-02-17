import './style.css';
import { APP_CONFIG } from './config';
import { InputHandler } from './input-handler';
import { decomposeFrameToLayers, type LayerTextureSet } from './layer-decomposer';
import { ParallaxRenderer } from './parallax-renderer';
import {
  type BinaryDownloadProgress,
  DepthFrameInterpolator,
  loadPrecomputedDepth,
} from './precomputed-depth';
import { UIController } from './ui';
import { createExtractionPlan, createHiddenVideoElement } from './video-source';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Application root element (#app) is missing.');
}

const ui = new UIController(app);
const input = new InputHandler(APP_CONFIG.motionLerpFactor);
const renderer = new ParallaxRenderer(
  app,
  APP_CONFIG.layerCount,
  APP_CONFIG.parallaxMaxOffsetPx,
  APP_CONFIG.overscanPadding
);

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unexpected error while starting app.';
  console.error(error);
  ui.showError(message);
  ui.setLoadingProgress(0, 'Failed to initialize precomputed depth pipeline.');
});

async function bootstrap(): Promise<void> {
  ui.setLoadingProgress(0.01, 'Loading video metadata and depth data...');
  const videoPromise = createHiddenVideoElement(APP_CONFIG.videoUrl);
  const depthDataPromise = loadPrecomputedDepth(
    APP_CONFIG.depthDataUrl,
    APP_CONFIG.depthMetaUrl,
    (progress) => {
      ui.setLoadingProgress(progress.fraction, formatDepthDownloadLabel(progress));
    }
  );

  const [video, depthData] = await Promise.all([videoPromise, depthDataPromise]);

  const processingPlan = createExtractionPlan(video, {
    fps: 1,
    maxDurationSec: Number.POSITIVE_INFINITY,
    workingMaxWidth: APP_CONFIG.workingMaxWidth,
  });

  renderer.initialize(processingPlan.width, processingPlan.height);

  const frameSampler = createVideoFrameSampler(processingPlan.width, processingPlan.height);
  const depthInterpolator = new DepthFrameInterpolator(
    depthData,
    processingPlan.width,
    processingPlan.height
  );

  let generatedFrameIndex = 0;
  let lastSourceFrameIndex = -1;
  let lastLayerFrame: LayerTextureSet | null = null;

  renderer.start(video, () => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return lastLayerFrame;
    }

    const sourceFrameIndex = Math.floor(video.currentTime * depthData.meta.sourceFps);
    if (lastLayerFrame && sourceFrameIndex === lastSourceFrameIndex) {
      return lastLayerFrame;
    }

    const frame = frameSampler.capture(video);
    const depthMap = depthInterpolator.sample(video.currentTime);
    const layers = decomposeFrameToLayers(frame, depthMap, generatedFrameIndex, video.currentTime, {
      layerCount: APP_CONFIG.layerCount,
      featherRadiusPx: APP_CONFIG.layerFeatherRadiusPx,
    });

    generatedFrameIndex += 1;
    lastSourceFrameIndex = sourceFrameIndex;
    lastLayerFrame = layers;

    return layers;
  }, () => input.update());

  video.currentTime = 0;
  await video.play();

  ui.hideLoading();
  ui.attachPlaybackControls(video);
  configureMotionPermissionFlow();

  window.addEventListener('beforeunload', () => {
    renderer.dispose();
    input.dispose();
    video.remove();
  });
}

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

function createVideoFrameSampler(width: number, height: number): {
  capture: (video: HTMLVideoElement) => ImageData;
} {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for runtime frame sampling.');
  }

  return {
    capture: (video) => {
      ctx.drawImage(video, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height);
    },
  };
}

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
