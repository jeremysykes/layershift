import { useCallback, useEffect, useRef, useState } from 'react';
import type { VideoEntry } from '../types';

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
    video.preload = 'metadata';
    video.src = videoSrc;

    const onSeeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 160, 90);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        thumbCache.set(videoSrc, dataUrl);
        resolve(dataUrl);
      } else {
        resolve('');
      }
      video.removeAttribute('src');
      video.load();
    };

    video.addEventListener('seeked', onSeeked, { once: true });
    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.5;
    }, { once: true });
    video.addEventListener('error', () => resolve(''), { once: true });
  });
}

interface VideoSelectorProps {
  videos: VideoEntry[];
  activeVideoId: string | null;
  onSelect: (id: string) => void;
  /** Larger thumbnails for fullscreen context */
  large?: boolean;
}

/**
 * Horizontal filmstrip of video thumbnails. Users can pick which demo
 * video to view the effect on. Scrolls horizontally on overflow.
 */
export function VideoSelector({ videos, activeVideoId, onSelect, large }: VideoSelectorProps) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect],
  );

  if (videos.length <= 1) return null;

  const w = large ? 112 : 96;
  const h = large ? 63 : 54;

  return (
    <div className={large ? '' : 'max-w-[640px] mx-auto mt-3 mb-6'}>
      <div
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto py-2 px-1 hide-scrollbar"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {videos.map((video) => {
          const isActive = video.id === activeVideoId;
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
      </div>
      {!large && activeVideoId && (
        <p
          className="text-center text-xs mt-1"
          style={{ color: '#555' }}
        >
          {formatLabel(
            videos.find((v) => v.id === activeVideoId)?.label ??
            videos.find((v) => v.id === activeVideoId)?.id ??
            '',
          )}
        </p>
      )}
    </div>
  );
}
