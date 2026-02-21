import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Maximize2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { LayershiftEffect, type ModelProgressDetail } from '../LayershiftEffect';
import { EffectErrorBoundary } from '../EffectErrorBoundary';
import { Skeleton } from '../../atoms/Skeleton';
import type { VideoEntry } from '../../../types';
import { DEPTH_MODEL_URL } from '../../../constants';

interface InlineDemoProps {
  tagName: string;
  demoAttrs: Record<string, string>;
  video: VideoEntry | null;
  /** When true, the demo uses the camera instead of a video source. */
  isCamera?: boolean;
  /** Called when the user clicks the fullscreen trigger */
  onEnterFullscreen?: () => void;
}

/**
 * Renders an inline demo of a Layershift effect with 16:9 aspect ratio.
 * The WebGL renderer and video are only initialised once the container
 * scrolls near the viewport (200 px ahead), avoiding unnecessary GPU
 * and network cost for content the user hasn't reached yet.
 */
export function InlineDemo({ tagName, demoAttrs, video, isCamera, onEnterFullscreen }: InlineDemoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [ready, setReady] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );

  // Model download progress (only shown for camera/estimator mode)
  const [modelProgress, setModelProgress] = useState<ModelProgressDetail | null>(null);

  const sourceKey = isCamera ? '__camera__' : video?.id;

  // Reset ready state and progress when source changes
  useEffect(() => {
    setReady(false);
    setModelProgress(null);
  }, [sourceKey]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px 200px 0px' },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const attrs = useMemo(() => {
    if (isCamera) {
      return { ...demoAttrs, 'source-type': 'camera', 'depth-model': DEPTH_MODEL_URL };
    }
    if (!video) return demoAttrs;

    const hasPrecomputedDepth = !!video.depthSrc && !!video.depthMeta;
    return {
      ...demoAttrs,
      src: video.src,
      ...(hasPrecomputedDepth
        ? { 'depth-src': video.depthSrc, 'depth-meta': video.depthMeta }
        : { 'depth-model': DEPTH_MODEL_URL }),
    };
  }, [demoAttrs, video, isCamera]);

  const handleReady = useCallback(() => setReady(true), []);

  const handleModelProgress = useCallback((detail: ModelProgressDetail) => {
    setModelProgress(detail);
  }, []);

  // Format bytes for display (e.g. "12.5 MB")
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Determine if we should show the model progress overlay
  const showProgress = modelProgress && !ready && modelProgress.fraction < 1;

  return (
    <div
      ref={containerRef}
      className="relative w-full max-w-[640px] aspect-video mx-auto my-8 rounded-xl overflow-hidden"
      style={{ border: '1px solid #222', background: '#000' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {visible && (
        <EffectErrorBoundary
          key={`${tagName}-${sourceKey}`}
          fallback={
            <div
              className="flex flex-col items-center justify-center gap-2"
              style={{ width: '100%', height: '100%', color: '#555' }}
            >
              <AlertTriangle size={20} />
              <span className="text-[0.8rem]">Could not load effect demo</span>
            </div>
          }
        >
          <LayershiftEffect
            tagName={tagName}
            attrs={attrs}
            onReady={handleReady}
            onModelProgress={handleModelProgress}
          />
        </EffectErrorBoundary>
      )}
      <Skeleton
        aria-hidden
        className={cn(
          'skeleton-shimmer absolute inset-0 z-[1] rounded-none',
          ready && 'skeleton-fade-out',
        )}
      />

      {/* Model download progress overlay */}
      {showProgress && (
        <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-3 pointer-events-none">
          <span className="text-[0.8rem] font-medium" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
            {modelProgress.label}
          </span>
          <div className="w-48 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${Math.round(modelProgress.fraction * 100)}%`,
                background: 'linear-gradient(90deg, #3b82f6, #10b981)',
              }}
            />
          </div>
          {modelProgress.totalBytes && (
            <span className="text-[0.7rem]" style={{ color: 'rgba(255, 255, 255, 0.4)' }}>
              {formatBytes(modelProgress.receivedBytes)} / {formatBytes(modelProgress.totalBytes)}
            </span>
          )}
        </div>
      )}

      {/* Fullscreen trigger */}
      {onEnterFullscreen && (
        <button
          type="button"
          aria-label="View fullscreen"
          onClick={onEnterFullscreen}
          className="absolute bottom-3 right-3 z-[2] w-9 h-9 rounded-lg backdrop-blur-sm flex items-center justify-center transition-all duration-200 cursor-pointer"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.6)',
            opacity: hovered || isTouchDevice ? 1 : 0,
            pointerEvents: ready ? 'auto' : 'none',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.7)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(0, 0, 0, 0.5)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
          }}
        >
          <Maximize2 className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
