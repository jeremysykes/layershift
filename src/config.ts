export const APP_CONFIG = {
  videoUrl: '/sample.mp4',
  extractionFps: 12,
  maxVideoDurationSec: 8,
  workingMaxWidth: 512,
  modelId: 'Xenova/depth-anything-small-hf',
  modelProgressWeight: 0.15,
  layerCount: 5,
  layerFeatherRadiusPx: 2,
  parallaxMaxOffsetPx: 30,
  playbackLagFrames: 6,
  ringBufferSize: 30,
  motionLerpFactor: 0.1,
} as const;
