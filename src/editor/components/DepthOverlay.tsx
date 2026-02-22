/**
 * Depth Overlay — depth map visualization controls.
 *
 * Provides a toggle to show/hide the depth map overlay on the preview
 * and an opacity slider. Also includes layer segmentation view toggle.
 */

import { useEditorStore } from '../hooks/useFilterState';

export function DepthOverlay() {
  const visible = useEditorStore((s) => s.depthOverlayVisible);
  const opacity = useEditorStore((s) => s.depthOverlayOpacity);
  const layerVisible = useEditorStore((s) => s.layerOverlayVisible);
  const setVisible = useEditorStore((s) => s.setDepthOverlayVisible);
  const setOpacity = useEditorStore((s) => s.setDepthOverlayOpacity);
  const setLayerVisible = useEditorStore((s) => s.setLayerOverlayVisible);

  return (
    <div
      className="flex flex-col gap-2 p-2.5 rounded-lg"
      style={{
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.1)',
      }}
    >
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
        Depth Overlay
      </div>

      {/* Show depth toggle */}
      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => setVisible(e.target.checked)}
          className="accent-white"
        />
        Show Depth
      </label>

      {/* Opacity slider */}
      {visible && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-12">Opacity</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="flex-1"
          />
          <span className="text-[10px] text-muted-foreground w-8 text-right">
            {Math.round(opacity * 100)}%
          </span>
        </div>
      )}

      {/* Layer view toggle */}
      <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
        <input
          type="checkbox"
          checked={layerVisible}
          onChange={(e) => setLayerVisible(e.target.checked)}
          className="accent-white"
        />
        Layer View
      </label>
    </div>
  );
}
