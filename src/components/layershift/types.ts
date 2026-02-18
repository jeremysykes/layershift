export interface LayershiftProps {
  src: string;
  depthSrc: string;
  depthMeta: string;
  parallaxX?: number;
  parallaxY?: number;
  parallaxMax?: number;
  layers?: number;
  overscan?: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  style?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Custom Event Detail Types
// ---------------------------------------------------------------------------

/** Fired once after initialization completes successfully. */
export interface LayershiftReadyDetail {
  videoWidth: number;
  videoHeight: number;
  duration: number;
}

/** Fired when video starts playing. */
export interface LayershiftPlayDetail {
  currentTime: number;
}

/** Fired when video pauses. */
export interface LayershiftPauseDetail {
  currentTime: number;
}

/** Fired when video loops back to start. */
export interface LayershiftLoopDetail {
  loopCount: number;
}

/** Fired on each new video frame (via requestVideoFrameCallback when available). */
export interface LayershiftFrameDetail {
  currentTime: number;
  frameNumber: number;
}

/** Fired on initialization errors. */
export interface LayershiftErrorDetail {
  message: string;
}

/**
 * Map of all custom events dispatched by `<layershift-parallax>`.
 *
 * Usage with addEventListener:
 * ```ts
 * el.addEventListener('layershift-parallax:ready', (e) => {
 *   console.log(e.detail.videoWidth, e.detail.duration);
 * });
 * ```
 */
export interface LayershiftEventMap {
  'layershift-parallax:ready': CustomEvent<LayershiftReadyDetail>;
  'layershift-parallax:play': CustomEvent<LayershiftPlayDetail>;
  'layershift-parallax:pause': CustomEvent<LayershiftPauseDetail>;
  'layershift-parallax:loop': CustomEvent<LayershiftLoopDetail>;
  'layershift-parallax:frame': CustomEvent<LayershiftFrameDetail>;
  'layershift-parallax:error': CustomEvent<LayershiftErrorDetail>;
}
