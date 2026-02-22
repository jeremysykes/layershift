/**
 * Displacement Ball — XY input control.
 *
 * Provides a draggable circle for controlling parallax input.
 * Supports two modes:
 * - Momentary: snaps back to center on release
 * - Latch: holds position after release
 */

import { useRef, useCallback, useEffect, useState } from 'react';
import { useEditorStore } from '../hooks/useFilterState';

const BALL_SIZE = 120;
const KNOB_SIZE = 24;
const MAX_OFFSET = (BALL_SIZE - KNOB_SIZE) / 2;

export function DisplacementBall() {
  const inputX = useEditorStore((s) => s.inputX);
  const inputY = useEditorStore((s) => s.inputY);
  const inputMode = useEditorStore((s) => s.inputMode);
  const setInput = useEditorStore((s) => s.setInput);
  const setInputMode = useEditorStore((s) => s.setInputMode);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const updateFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = (clientX - cx) / MAX_OFFSET;
      const dy = (clientY - cy) / MAX_OFFSET;
      const clampedX = Math.max(-1, Math.min(1, dx));
      const clampedY = Math.max(-1, Math.min(1, dy));
      setInput(clampedX, clampedY);
    },
    [setInput],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      updateFromEvent(e.clientX, e.clientY);
    },
    [updateFromEvent],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      updateFromEvent(e.clientX, e.clientY);
    },
    [isDragging, updateFromEvent],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    if (inputMode === 'momentary') {
      setInput(0, 0);
    }
  }, [inputMode, setInput]);

  // Knob position in pixels
  const knobX = inputX * MAX_OFFSET;
  const knobY = inputY * MAX_OFFSET;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Ball area */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative rounded-full cursor-grab active:cursor-grabbing select-none"
        style={{
          width: BALL_SIZE,
          height: BALL_SIZE,
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.15)',
          touchAction: 'none',
        }}
      >
        {/* Crosshair */}
        <div
          className="absolute"
          style={{
            top: '50%',
            left: 4,
            right: 4,
            height: 1,
            background: 'rgba(255,255,255,0.08)',
            transform: 'translateY(-0.5px)',
          }}
        />
        <div
          className="absolute"
          style={{
            left: '50%',
            top: 4,
            bottom: 4,
            width: 1,
            background: 'rgba(255,255,255,0.08)',
            transform: 'translateX(-0.5px)',
          }}
        />

        {/* Knob */}
        <div
          className="absolute rounded-full"
          style={{
            width: KNOB_SIZE,
            height: KNOB_SIZE,
            background: isDragging ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.7)',
            border: '2px solid rgba(255,255,255,0.3)',
            top: '50%',
            left: '50%',
            transform: `translate(calc(-50% + ${knobX}px), calc(-50% + ${knobY}px))`,
            transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}
        />
      </div>

      {/* Mode toggle */}
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
        <button
          onClick={() => setInputMode('momentary')}
          className={`px-2 py-0.5 rounded transition-colors ${
            inputMode === 'momentary'
              ? 'bg-accent text-primary'
              : 'hover:text-card-foreground'
          }`}
        >
          Momentary
        </button>
        <button
          onClick={() => setInputMode('latch')}
          className={`px-2 py-0.5 rounded transition-colors ${
            inputMode === 'latch'
              ? 'bg-accent text-primary'
              : 'hover:text-card-foreground'
          }`}
        >
          Latch
        </button>
      </div>
    </div>
  );
}
