/**
 * Video Library — video picker panel.
 *
 * Lists all videos that have precomputed depth data.
 * Grouped by category (parallax, textural, etc.).
 */

import { useCallback } from 'react';
import { useEditorStore } from '../hooks/useFilterState';

export function VideoLibrary() {
  const videos = useEditorStore((s) => s.videos);
  const selectedVideoId = useEditorStore((s) => s.selectedVideoId);
  const selectVideo = useEditorStore((s) => s.selectVideo);

  // Group by category
  const categories = videos.reduce<Record<string, typeof videos>>((acc, v) => {
    (acc[v.category] ??= []).push(v);
    return acc;
  }, {});

  const handleSelect = useCallback(
    (id: string) => {
      selectVideo(id);
    },
    [selectVideo],
  );

  if (videos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">No videos found.</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {Object.entries(categories).map(([category, entries]) => (
        <div key={category}>
          <h3 className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
            {category}
          </h3>
          <div className="flex flex-col gap-1">
            {entries.map((video) => (
              <button
                key={`${category}-${video.id}`}
                onClick={() => handleSelect(video.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                  selectedVideoId === video.id
                    ? 'bg-accent text-primary'
                    : 'text-foreground hover:bg-accent/50 hover:text-card-foreground'
                }`}
              >
                {video.thumb ? (
                  <img
                    src={video.thumb}
                    alt={video.id}
                    className="w-8 h-8 rounded object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded bg-muted shrink-0" />
                )}
                <span className="truncate">{video.label || video.id}</span>
                {video.type === 'image' && (
                  <span className="text-[9px] text-muted-foreground ml-auto shrink-0">IMG</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
