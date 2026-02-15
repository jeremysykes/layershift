import './style.css';
import { APP_CONFIG } from './config';
import { DepthEngine } from './depth-engine';
import { InputHandler } from './input-handler';
import { decomposeFrameToLayers, type LayerTextureSet } from './layer-decomposer';
import { ParallaxRenderer } from './parallax-renderer';
import { UIController } from './ui';
import {
  createExtractionPlan,
  createHiddenVideoElement,
  extractFramesBySeeking,
} from './video-source';

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
  APP_CONFIG.ringBufferSize
);

void bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Unexpected error while starting app.';
  console.error(error);
  ui.showError(message);
  ui.setLoadingProgress(0, 'Failed to initialize depth pipeline.');
});

async function bootstrap(): Promise<void> {
  ui.setLoadingProgress(0.01, 'Loading video...');
  const video = await createHiddenVideoElement(APP_CONFIG.videoUrl);

  const extractionPlan = createExtractionPlan(video, {
    fps: APP_CONFIG.extractionFps,
    maxDurationSec: APP_CONFIG.maxVideoDurationSec,
    workingMaxWidth: APP_CONFIG.workingMaxWidth,
  });

  renderer.initialize(extractionPlan.width, extractionPlan.height);

  const depthEngine = new DepthEngine(APP_CONFIG.modelId);
  ui.setLoadingProgress(0.02, 'Loading depth model...');
  await depthEngine.init((progress) => {
    const modelProgress = clamp(progress.progress ?? 0, 0, 1) * APP_CONFIG.modelProgressWeight;
    const message = progress.file
      ? `Loading depth model asset: ${progress.file}`
      : 'Loading depth model...';
    ui.setLoadingProgress(modelProgress, message);
  });

  const processedFrames: LayerTextureSet[] = [];
  ui.setLoadingProgress(
    APP_CONFIG.modelProgressWeight,
    `Preprocessing ${extractionPlan.frameCount} frames...`
  );

  await extractFramesBySeeking(video, extractionPlan, async (frame, totalFrames) => {
    const depthMap = await depthEngine.estimateDepth(
      frame.imageData,
      frame.width,
      frame.height
    );

    const layers = decomposeFrameToLayers(
      frame.imageData,
      depthMap,
      frame.index,
      frame.timeSec,
      {
        layerCount: APP_CONFIG.layerCount,
        featherRadiusPx: APP_CONFIG.layerFeatherRadiusPx,
      }
    );

    processedFrames.push(layers);

    const frameProgress = (frame.index + 1) / totalFrames;
    const totalProgress =
      APP_CONFIG.modelProgressWeight + frameProgress * (1 - APP_CONFIG.modelProgressWeight);

    ui.setLoadingProgress(
      totalProgress,
      `Preprocessing frame ${frame.index + 1}/${totalFrames}`
    );
  });

  ui.setLoadingProgress(1, 'Starting playback...');

  renderer.start(
    video,
    processedFrames,
    extractionPlan.fps,
    APP_CONFIG.playbackLagFrames,
    () => input.update()
  );

  video.currentTime = 0;
  await video.play();

  ui.hideLoading();
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

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
