/**
 * Editor App — Main layout.
 *
 * Three-panel layout: video library (left), preview canvas (center),
 * effect configurator + export (right).
 */

import { useEffect, useCallback } from 'react';
import { useEditorStore, type VideoEntry } from './hooks/useFilterState';
import { VideoLibrary } from './components/VideoLibrary';
import { PreviewCanvas } from './components/PreviewCanvas';
import { EffectConfigurator } from './components/EffectConfigurator';
import { ExportPanel } from './components/ExportPanel';
import { LayerControls } from './components/LayerControls';
import { DepthOverlay } from './components/DepthOverlay';
import { DisplacementBall } from './components/DisplacementBall';

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

interface ManifestEntry {
  id: string;
  type: 'video' | 'image';
  src: string;
  depthSrc: string;
  depthMeta: string;
  thumb?: string;
  label?: string;
}

async function loadVideoManifest(): Promise<VideoEntry[]> {
  try {
    const res = await fetch('/videos/manifest.json');
    const data = await res.json();
    const entries: VideoEntry[] = [];

    if (Array.isArray(data)) {
      for (const entry of data as ManifestEntry[]) {
        entries.push({ ...entry, category: 'parallax' });
      }
    } else {
      for (const [category, videos] of Object.entries(data)) {
        for (const entry of videos as ManifestEntry[]) {
          entries.push({ ...entry, category });
        }
      }
    }

    return entries;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
  const setVideos = useEditorStore((s) => s.setVideos);
  const advancedMode = useEditorStore((s) => s.advancedMode);
  const setAdvancedMode = useEditorStore((s) => s.setAdvancedMode);
  const isLoading = useEditorStore((s) => s.isLoading);
  const loadingMessage = useEditorStore((s) => s.loadingMessage);

  useEffect(() => {
    loadVideoManifest().then(setVideos);
  }, [setVideos]);

  const toggleAdvanced = useCallback(() => {
    setAdvancedMode(!advancedMode);
  }, [advancedMode, setAdvancedMode]);

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <h1 className="text-sm font-semibold text-primary tracking-wide">
          Layer Shift Filter Author
        </h1>
        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
          Advanced
          <input
            type="checkbox"
            checked={advancedMode}
            onChange={toggleAdvanced}
            className="accent-white"
          />
        </label>
      </header>

      {/* Main content */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel — Video Library */}
        <aside className="w-52 border-r border-border flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Video Library
            </h2>
            <VideoLibrary />
          </div>
        </aside>

        {/* Center panel — Preview */}
        <main className="flex-1 flex flex-col min-w-0 relative">
          <PreviewCanvas />

          {/* Overlay controls on the preview */}
          <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between pointer-events-none">
            <div className="pointer-events-auto">
              <DisplacementBall />
            </div>
            <div className="pointer-events-auto">
              <DepthOverlay />
            </div>
          </div>

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">{loadingMessage || 'Loading...'}</p>
              </div>
            </div>
          )}
        </main>

        {/* Right panel — Controls */}
        <aside className="w-72 border-l border-border flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 flex flex-col gap-4">
            <EffectConfigurator />
            {advancedMode && <LayerControls />}
            <ExportPanel />
          </div>
        </aside>
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function StatusBar() {
  const effectType = useEditorStore((s) => s.effectType);
  const layers = useEditorStore((s) => s.layers);
  const selectedVideoId = useEditorStore((s) => s.selectedVideoId);
  const videos = useEditorStore((s) => s.videos);

  const video = videos.find((v) => v.id === selectedVideoId);
  const videoLabel = video ? video.src.split('/').pop() : 'none';

  return (
    <footer className="flex items-center px-4 py-1.5 border-t border-border text-xs text-muted-foreground shrink-0">
      <span>
        Effect: <span className="text-card-foreground">{effectType}</span>
        {' | '}
        Layers: <span className="text-card-foreground">{layers.length}</span>
        {' | '}
        Video: <span className="text-card-foreground">{videoLabel}</span>
      </span>
    </footer>
  );
}
