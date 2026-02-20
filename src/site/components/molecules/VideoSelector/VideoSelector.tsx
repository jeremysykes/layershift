import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Video, VideoOff } from 'lucide-react';
import type { VideoEntry } from '../../../types';

export const CAMERA_SENTINEL = '__camera__' as const;

/** Convert a kebab-case ID into a Title Case label. */
function formatLabel(id: string): string {
  return id.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Extracts a thumbnail from a video by seeking to 0.5s and drawing
 * the frame to a canvas. Returns a data URL. Results are cached so
 * each video is only extracted once.
 */
const thumbCache = new Map<string, string>();

function extractThumb(videoSrc: string): Promise<string> {
  const cached = thumbCache.get(videoSrc);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoSrc;

    let resolved = false;
    const finish = (dataUrl: string) => {
      if (resolved) return;
      resolved = true;
      if (dataUrl) thumbCache.set(videoSrc, dataUrl);
      resolve(dataUrl);
      video.removeAttribute('src');
      video.load();
    };

    const capture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 160, 90);
        finish(canvas.toDataURL('image/jpeg', 0.7));
      } else {
        finish('');
      }
    };

    video.addEventListener('seeked', capture, { once: true });
    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.5;
    }, { once: true });
    video.addEventListener('error', () => finish(''), { once: true });

    // Timeout: mobile may never fire events for background video loads
    setTimeout(() => finish(''), 5000);
  });
}

export type WebcamState = 'idle' | 'pending' | 'active' | 'error';

// ---------------------------------------------------------------------------
// WebcamTile — four-state camera tile at the end of the filmstrip
// ---------------------------------------------------------------------------

function WebcamTile({
  state,
  stream,
  isSelected,
  onClick,
  w,
  h,
}: {
  state: WebcamState;
  stream: MediaStream | null;
  isSelected: boolean;
  onClick: () => void;
  w: number;
  h: number;
}) {
  const previewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = previewRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    return () => { el.srcObject = null; };
  }, [stream]);

  const isActive = state === 'active' && isSelected;
  const hasLivePreview = state === 'active' && stream;
  const isPending = state === 'pending';
  const isError = state === 'error';

  const ariaLabel =
    isPending ? 'Requesting camera access…' :
    isActive ? 'Your camera (live)' :
    isError ? 'Camera unavailable — click to retry' :
    'Use your camera';

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={isActive}
      title={isError ? 'Camera access denied — click to retry' : undefined}
      className="shrink-0 relative rounded-lg overflow-hidden transition-all duration-200 cursor-pointer"
      style={{
        width: w,
        height: h,
        background: '#111',
        border: isActive
          ? '2px solid rgba(255, 255, 255, 0.8)'
          : isPending
            ? '2px solid rgba(255, 255, 255, 0.3)'
            : '2px solid transparent',
        opacity: isActive ? 1 : isError ? 0.35 : isPending ? 0.7 : 0.5,
        outline: 'none',
        pointerEvents: isPending ? 'none' : 'auto',
      }}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.opacity = isError ? '0.5' : '0.8';
          e.currentTarget.style.borderColor = isError
            ? 'rgba(255, 255, 255, 0.15)'
            : 'rgba(255, 255, 255, 0.3)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.opacity = isError ? '0.35' : isPending ? '0.7' : '0.5';
          e.currentTarget.style.borderColor = isPending
            ? 'rgba(255, 255, 255, 0.3)'
            : 'transparent';
        }
      }}
    >
      {/* Live preview (active state with stream) */}
      {hasLivePreview && (
        <video
          ref={previewRef}
          muted
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }}
        />
      )}

      {/* LIVE badge */}
      {isActive && hasLivePreview && (
        <span
          className="absolute top-1 right-1 text-white font-bold uppercase tracking-wider rounded-sm"
          style={{
            fontSize: '0.45rem',
            background: 'rgba(239, 68, 68, 0.9)',
            padding: '1px 4px',
            lineHeight: 1.4,
          }}
        >
          LIVE
        </span>
      )}

      {/* Idle icon */}
      {!hasLivePreview && !isPending && !isError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Video size={20} style={{ color: 'rgba(255, 255, 255, 0.4)' }} />
        </div>
      )}

      {/* Pending pulsing dot */}
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className="pulse-dot block rounded-full"
            style={{
              width: 6,
              height: 6,
              background: 'rgba(255, 255, 255, 0.5)',
              animation: 'pulse-dot 1.5s ease-in-out infinite',
            }}
          />
        </div>
      )}

      {/* Error icon */}
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <VideoOff size={20} style={{ color: 'rgba(255, 255, 255, 0.25)' }} />
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// VideoSelector
// ---------------------------------------------------------------------------

interface VideoSelectorProps {
  videos: VideoEntry[];
  activeVideoId: string | null;
  onSelect: (id: string) => void;
  /** Larger thumbnails for fullscreen context */
  large?: boolean;
  showWebcam?: boolean;
  webcamState?: WebcamState;
  webcamStream?: MediaStream | null;
  onWebcamClick?: () => void;
  isWebcamSelected?: boolean;
}

/** gap-2 = 8px in Tailwind */
const GAP = 8;

/**
 * Horizontal filmstrip of video thumbnails. Users can pick which demo
 * video to view the effect on. Desktop: left/right arrows + edge gradient
 * masks. Touch: native swipe + gradient masks only.
 */
export function VideoSelector({
  videos,
  activeVideoId,
  onSelect,
  large,
  showWebcam,
  webcamState = 'idle',
  webcamStream = null,
  onWebcamClick,
  isWebcamSelected = false,
}: VideoSelectorProps) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [isTouchDevice] = useState(() =>
    typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );

  const w = large ? 112 : 96;
  const h = large ? 63 : 54;

  // Extract thumbnails lazily
  useEffect(() => {
    let cancelled = false;
    videos.forEach((v) => {
      const src = v.thumb;
      if (src) {
        setThumbs((prev) => ({ ...prev, [v.id]: src }));
        return;
      }
      extractThumb(v.src).then((dataUrl) => {
        if (!cancelled && dataUrl) {
          setThumbs((prev) => ({ ...prev, [v.id]: dataUrl }));
        }
      });
    });
    return () => { cancelled = true; };
  }, [videos]);

  // Track scroll position to show/hide arrows + gradient masks
  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 4;
    setCanScrollLeft(el.scrollLeft > threshold);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - threshold);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    updateScrollState();

    el.addEventListener('scroll', updateScrollState, { passive: true });
    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);

    return () => {
      el.removeEventListener('scroll', updateScrollState);
      observer.disconnect();
    };
  }, [updateScrollState, videos]);

  // Scroll by 3 thumbnails per click, calculated from actual size + gap
  const scrollAmount = (w + GAP) * 3;

  const scroll = useCallback((direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = direction === 'left' ? -scrollAmount : scrollAmount;
    el.scrollBy({ left: amount, behavior: 'smooth' });
  }, [scrollAmount]);

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  const itemCount = videos.length + (showWebcam ? 1 : 0);
  if (itemCount <= 1) return null;

  return (
    <div className={large ? '' : 'max-w-[640px] mx-auto mt-3 mb-6'}>
      <div className="relative">
        {/* Left gradient mask — passive "more content" hint */}
        <div
          className="absolute left-0 top-0 bottom-0 z-[1] w-10 pointer-events-none transition-opacity duration-300"
          style={{
            background: 'linear-gradient(to right, #000 0%, transparent 100%)',
            opacity: canScrollLeft ? 1 : 0,
          }}
        />

        {/* Right gradient mask */}
        <div
          className="absolute right-0 top-0 bottom-0 z-[1] w-10 pointer-events-none transition-opacity duration-300"
          style={{
            background: 'linear-gradient(to left, #000 0%, transparent 100%)',
            opacity: canScrollRight ? 1 : 0,
          }}
        />

        {/* Left arrow — desktop only, always rendered, opacity-toggled */}
        {!isTouchDevice && (
          <button
            type="button"
            aria-label="Scroll left"
            onClick={() => scroll('left')}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(4px)',
              opacity: canScrollLeft ? 1 : 0,
              pointerEvents: canScrollLeft ? 'auto' : 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        {/* Right arrow — desktop only, always rendered, opacity-toggled */}
        {!isTouchDevice && (
          <button
            type="button"
            aria-label="Scroll right"
            onClick={() => scroll('right')}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-[2] w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer"
            style={{
              background: 'rgba(0, 0, 0, 0.6)',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(4px)',
              opacity: canScrollRight ? 1 : 0,
              pointerEvents: canScrollRight ? 'auto' : 'none',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.8)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.95)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(0, 0, 0, 0.6)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* Filmstrip */}
        <div
          ref={scrollRef}
          className="flex gap-2 overflow-x-auto py-2 px-1 hide-scrollbar"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {videos.map((video) => {
            const isActive = video.id === activeVideoId && !isWebcamSelected;
            return (
              <button
                key={video.id}
                type="button"
                onClick={() => handleSelect(video.id)}
                aria-label={video.label ?? formatLabel(video.id)}
                aria-pressed={isActive}
                className="shrink-0 relative rounded-lg overflow-hidden transition-all duration-200 cursor-pointer"
                style={{
                  width: w,
                  height: h,
                  border: isActive
                    ? '2px solid rgba(255, 255, 255, 0.8)'
                    : '2px solid transparent',
                  opacity: isActive ? 1 : 0.5,
                  outline: 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.opacity = '0.5';
                    e.currentTarget.style.borderColor = 'transparent';
                  }
                }}
              >
                {thumbs[video.id] ? (
                  <img
                    src={thumbs[video.id]}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className="absolute inset-0 flex items-center justify-center text-[0.6rem]"
                    style={{ background: '#111', color: '#555' }}
                  >
                    {formatLabel(video.label ?? video.id)}
                  </div>
                )}
              </button>
            );
          })}

          {/* Divider + Webcam tile */}
          {showWebcam && onWebcamClick && (
            <>
              <div
                className="shrink-0 self-center"
                style={{
                  width: 1,
                  height: h,
                  background: 'rgba(255, 255, 255, 0.1)',
                  margin: '0 4px',
                }}
              />
              <WebcamTile
                state={webcamState}
                stream={webcamStream ?? null}
                isSelected={isWebcamSelected}
                onClick={onWebcamClick}
                w={w}
                h={h}
              />
            </>
          )}
        </div>
      </div>
      {!large && (
        <p
          className="text-center text-xs mt-1"
          style={{ color: '#555' }}
        >
          {isWebcamSelected
            ? 'Your Camera'
            : formatLabel(
                videos.find((v) => v.id === activeVideoId)?.label ??
                videos.find((v) => v.id === activeVideoId)?.id ??
                '',
              )}
        </p>
      )}
    </div>
  );
}
