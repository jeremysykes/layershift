export const APP_CONFIG = {
  videoUrl: '/sample.mp4',
  depthDataUrl: '/depth-data.bin',
  depthMetaUrl: '/depth-meta.json',
  workingMaxWidth: 512,
  layerCount: 5,
  layerFeatherRadiusPx: 2,
  parallaxMaxOffsetPx: 30,
  overscanPadding: 0.02,
  motionLerpFactor: 0.1,
} as const;
