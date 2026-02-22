/**
 * Layer Controls — layer segmentation and per-layer parameter sliders.
 *
 * Advanced mode panel that lets you configure depth layer boundaries
 * and per-layer effect intensity.
 */

import { useCallback } from 'react';
import { useEditorStore } from '../hooks/useFilterState';

/** Colors for depth layer visualization. */
const LAYER_COLORS = [
  '#ef4444', // red (foreground / near)
  '#f59e0b', // amber
  '#22c55e', // green (midground)
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#f97316', // orange (background / far)
];

export function LayerControls() {
  const layers = useEditorStore((s) => s.layers);
  const updateLayer = useEditorStore((s) => s.updateLayer);
  const setLayerCount = useEditorStore((s) => s.setLayerCount);

  const handleCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLayerCount(parseInt(e.target.value, 10));
    },
    [setLayerCount],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Depth Layers
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">Count</span>
          <input
            type="number"
            min={1}
            max={8}
            value={layers.length}
            onChange={handleCountChange}
            className="w-10 text-xs text-center bg-muted border border-border rounded px-1 py-0.5 text-card-foreground"
          />
        </div>
      </div>

      {/* Layer depth preview bar */}
      <div className="flex h-3 rounded overflow-hidden">
        {layers.map((layer, i) => (
          <div
            key={i}
            style={{
              flex: layer.end - layer.start,
              background: LAYER_COLORS[i % LAYER_COLORS.length],
              opacity: 0.7,
            }}
          />
        ))}
      </div>

      {/* Per-layer controls */}
      <div className="flex flex-col gap-2">
        {layers.map((layer, i) => (
          <div key={i} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: LAYER_COLORS[i % LAYER_COLORS.length] }}
              />
              <input
                type="text"
                value={layer.label}
                onChange={(e) => updateLayer(i, { label: e.target.value })}
                className="text-xs text-card-foreground bg-transparent border-none outline-none flex-1 min-w-0"
              />
              <span className="text-[10px] text-muted-foreground shrink-0">
                {(layer.start * 100).toFixed(0)}-{(layer.end * 100).toFixed(0)}%
              </span>
            </div>

            {/* Threshold sliders */}
            <div className="flex items-center gap-1.5 pl-4">
              <span className="text-[9px] text-muted-foreground w-6">Start</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layer.start}
                onChange={(e) => updateLayer(i, { start: parseFloat(e.target.value) })}
                className="flex-1"
              />
            </div>
            <div className="flex items-center gap-1.5 pl-4">
              <span className="text-[9px] text-muted-foreground w-6">End</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layer.end}
                onChange={(e) => updateLayer(i, { end: parseFloat(e.target.value) })}
                className="flex-1"
              />
            </div>

            {/* Intensity */}
            <div className="flex items-center gap-1.5 pl-4">
              <span className="text-[9px] text-muted-foreground w-6">FX</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={layer.intensity}
                onChange={(e) => updateLayer(i, { intensity: parseFloat(e.target.value) })}
                className="flex-1"
              />
              <span className="text-[9px] text-muted-foreground w-7 text-right">
                {Math.round(layer.intensity * 100)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
