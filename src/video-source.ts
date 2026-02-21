export interface FrameExtractionOptions {
  fps: number;
  maxDurationSec: number;
  workingMaxWidth: number;
}

export interface ExtractionPlan {
  fps: number;
  durationSec: number;
  frameCount: number;
  width: number;
  height: number;
}

export interface ExtractedFrame {
  index: number;
  timeSec: number;
  imageData: ImageData;
  width: number;
  height: number;
}

const SEEK_EPSILON_SECONDS = 0.001;

export function createExtractionPlan(
  video: HTMLVideoElement,
  options: FrameExtractionOptions
): ExtractionPlan {
  const durationSec = Math.min(video.duration, options.maxDurationSec);
  const frameCount = Math.max(1, Math.floor(durationSec * options.fps));

  const scale = Math.min(1, options.workingMaxWidth / video.videoWidth);
  const width = Math.max(1, Math.round(video.videoWidth * scale));
  const height = Math.max(1, Math.round(video.videoHeight * scale));

  return {
    fps: options.fps,
    durationSec,
    frameCount,
    width,
    height,
  };
}

export async function extractFramesBySeeking(
  video: HTMLVideoElement,
  plan: ExtractionPlan,
  onFrame: (frame: ExtractedFrame, totalFrames: number) => Promise<void> | void,
  onProgress?: (progress: number) => void
): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = plan.width;
  canvas.height = plan.height;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Could not create 2D canvas context for frame extraction.');
  }

  video.pause();

  for (let index = 0; index < plan.frameCount; index += 1) {
    const timeSec = Math.min(
      index / plan.fps,
      Math.max(0, plan.durationSec - SEEK_EPSILON_SECONDS)
    );

    await seekVideo(video, timeSec);
    ctx.drawImage(video, 0, 0, plan.width, plan.height);

    const imageData = ctx.getImageData(0, 0, plan.width, plan.height);
    await onFrame(
      {
        index,
        timeSec,
        imageData,
        width: plan.width,
        height: plan.height,
      },
      plan.frameCount
    );

    onProgress?.((index + 1) / plan.frameCount);
  }
}

async function waitForMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const onLoadedMetadata = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Failed to load video metadata.'));
    };

    const cleanup = () => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata);
    video.addEventListener('error', onError);
    video.load();
  });
}

async function seekVideo(video: HTMLVideoElement, targetTimeSec: number): Promise<void> {
  if (Math.abs(video.currentTime - targetTimeSec) < SEEK_EPSILON_SECONDS) {
    return;
  }

  const boundedTime = Math.min(
    Math.max(0, targetTimeSec),
    Math.max(0, video.duration - SEEK_EPSILON_SECONDS)
  );

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error(`Unable to seek video to ${boundedTime}s.`));
    };

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = boundedTime;
  });
}
