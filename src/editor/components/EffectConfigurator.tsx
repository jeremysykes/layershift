/**
 * Effect Configurator — effect type selector + effect-specific parameters.
 *
 * Shows a dropdown to pick the effect type, then renders the appropriate
 * parameter controls for that effect. In simple mode (advanced off),
 * shows only a single intensity slider + type selector.
 */

import { useCallback } from 'react';
import { useEditorStore } from '../hooks/useFilterState';
import {
  EFFECT_LABELS,
  EFFECT_DESCRIPTIONS,
  type EffectType,
  type ParallaxParams,
  type TiltShiftParams,
  type ForegroundGlowParams,
  type RackFocusParams,
} from '../types/filter-config';

const EFFECT_TYPES: EffectType[] = ['parallax', 'tilt-shift', 'foreground-glow', 'rack-focus', 'custom'];

export function EffectConfigurator() {
  const effectType = useEditorStore((s) => s.effectType);
  const setEffectType = useEditorStore((s) => s.setEffectType);
  const advancedMode = useEditorStore((s) => s.advancedMode);

  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setEffectType(e.target.value as EffectType);
    },
    [setEffectType],
  );

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Effect
      </h2>

      {/* Type selector */}
      <div className="flex flex-col gap-1.5">
        <select
          value={effectType}
          onChange={handleTypeChange}
          className="w-full"
        >
          {EFFECT_TYPES.map((t) => (
            <option key={t} value={t}>
              {EFFECT_LABELS[t]}
            </option>
          ))}
        </select>
        <p className="text-[10px] text-muted-foreground leading-tight">
          {EFFECT_DESCRIPTIONS[effectType]}
        </p>
      </div>

      {/* Effect parameters */}
      <div className="flex flex-col gap-2">
        {effectType === 'parallax' && <ParallaxControls advanced={advancedMode} />}
        {effectType === 'tilt-shift' && <TiltShiftControls advanced={advancedMode} />}
        {effectType === 'foreground-glow' && <ForegroundGlowControls advanced={advancedMode} />}
        {effectType === 'rack-focus' && <RackFocusControls advanced={advancedMode} />}
        {effectType === 'custom' && <CustomControls />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared slider component
// ---------------------------------------------------------------------------

function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  const display = format ? format(value) : value.toFixed(2);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-muted-foreground w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1"
      />
      <span className="text-[10px] text-muted-foreground w-10 text-right shrink-0">
        {display}
      </span>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-white"
      />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Parallax controls
// ---------------------------------------------------------------------------

function ParallaxControls({ advanced }: { advanced: boolean }) {
  const params = useEditorStore((s) => s.effectParams.parallax) as ParallaxParams;
  const update = useEditorStore((s) => s.updateEffectParam);

  const set = useCallback(
    <K extends keyof ParallaxParams>(key: K, value: ParallaxParams[K]) => {
      update('parallax', key, value);
    },
    [update],
  );

  return (
    <>
      <Slider
        label="Strength"
        value={params.strength}
        onChange={(v) => set('strength', v)}
        min={0}
        max={0.2}
        step={0.001}
      />

      {advanced && (
        <>
          <Toggle
            label="POM Enabled"
            checked={params.pomEnabled}
            onChange={(v) => set('pomEnabled', v)}
          />
          <Slider
            label="POM Steps"
            value={params.pomSteps}
            onChange={(v) => set('pomSteps', Math.round(v))}
            min={4}
            max={64}
            step={1}
            format={(v) => String(Math.round(v))}
          />
          <Slider
            label="Contrast Low"
            value={params.contrastLow}
            onChange={(v) => set('contrastLow', v)}
          />
          <Slider
            label="Contrast High"
            value={params.contrastHigh}
            onChange={(v) => set('contrastHigh', v)}
          />
          <Slider
            label="Vertical Reduce"
            value={params.verticalReduction}
            onChange={(v) => set('verticalReduction', v)}
          />
          <Slider
            label="DOF Start"
            value={params.dofStart}
            onChange={(v) => set('dofStart', v)}
          />
          <Slider
            label="DOF Strength"
            value={params.dofStrength}
            onChange={(v) => set('dofStrength', v)}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Tilt Shift controls
// ---------------------------------------------------------------------------

function TiltShiftControls({ advanced }: { advanced: boolean }) {
  const params = useEditorStore((s) => s.effectParams['tilt-shift']) as TiltShiftParams;
  const update = useEditorStore((s) => s.updateEffectParam);

  const set = useCallback(
    <K extends keyof TiltShiftParams>(key: K, value: TiltShiftParams[K]) => {
      update('tilt-shift', key, value);
    },
    [update],
  );

  return (
    <>
      <Slider
        label="Focal Center"
        value={params.focalCenter}
        onChange={(v) => set('focalCenter', v)}
      />
      <Slider
        label="Focal Width"
        value={params.focalWidth}
        onChange={(v) => set('focalWidth', v)}
      />
      <Slider
        label="Blur Strength"
        value={params.blurStrength}
        onChange={(v) => set('blurStrength', v)}
      />

      {advanced && (
        <>
          <Slider
            label="Blur Samples"
            value={params.blurSamples}
            onChange={(v) => set('blurSamples', Math.round(v))}
            min={2}
            max={16}
            step={1}
            format={(v) => String(Math.round(v))}
          />
          <Slider
            label="Transition"
            value={params.transitionSoftness}
            onChange={(v) => set('transitionSoftness', v)}
            min={0.01}
            max={0.5}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Foreground Glow controls
// ---------------------------------------------------------------------------

function ForegroundGlowControls({ advanced }: { advanced: boolean }) {
  const params = useEditorStore((s) => s.effectParams['foreground-glow']) as ForegroundGlowParams;
  const update = useEditorStore((s) => s.updateEffectParam);

  const set = useCallback(
    <K extends keyof ForegroundGlowParams>(key: K, value: ForegroundGlowParams[K]) => {
      update('foreground-glow', key, value);
    },
    [update],
  );

  return (
    <>
      <Slider
        label="Threshold"
        value={params.glowThreshold}
        onChange={(v) => set('glowThreshold', v)}
      />
      <Slider
        label="Intensity"
        value={params.glowIntensity}
        onChange={(v) => set('glowIntensity', v)}
      />

      {advanced && (
        <>
          <Slider
            label="Radius"
            value={params.glowRadius}
            onChange={(v) => set('glowRadius', v)}
            max={0.1}
          />
          <Slider
            label="Edge Softness"
            value={params.edgeSoftness}
            onChange={(v) => set('edgeSoftness', v)}
            max={0.5}
          />

          {/* Glow color */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground w-20 shrink-0">Glow Color</span>
            <input
              type="color"
              value={rgbToHex(params.glowColor)}
              onChange={(e) => set('glowColor', hexToRgb(e.target.value))}
              className="w-6 h-6 rounded border border-border cursor-pointer bg-transparent"
            />
            <span className="text-[10px] text-muted-foreground">
              {rgbToHex(params.glowColor)}
            </span>
          </div>
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Rack Focus controls
// ---------------------------------------------------------------------------

function RackFocusControls({ advanced }: { advanced: boolean }) {
  const params = useEditorStore((s) => s.effectParams['rack-focus']) as RackFocusParams;
  const update = useEditorStore((s) => s.updateEffectParam);

  const set = useCallback(
    <K extends keyof RackFocusParams>(key: K, value: RackFocusParams[K]) => {
      update('rack-focus', key, value);
    },
    [update],
  );

  return (
    <>
      <Slider
        label="Focus Start"
        value={params.focusStart}
        onChange={(v) => set('focusStart', v)}
      />
      <Slider
        label="Focus End"
        value={params.focusEnd}
        onChange={(v) => set('focusEnd', v)}
      />
      <Slider
        label="Duration"
        value={params.rackDuration}
        onChange={(v) => set('rackDuration', v)}
        min={0.5}
        max={10}
        step={0.1}
        format={(v) => `${v.toFixed(1)}s`}
      />

      {advanced && (
        <>
          <Slider
            label="Focal Width"
            value={params.focalWidth}
            onChange={(v) => set('focalWidth', v)}
          />
          <Slider
            label="Blur Strength"
            value={params.blurStrength}
            onChange={(v) => set('blurStrength', v)}
          />
          <Toggle
            label="Loop"
            checked={params.loop}
            onChange={(v) => set('loop', v)}
          />
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom controls
// ---------------------------------------------------------------------------

function CustomControls() {
  return (
    <div className="text-xs text-muted-foreground">
      <p>Custom mode exposes raw depth data and all parameters.</p>
      <p className="mt-1">Export will generate a template shader you can edit manually.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Color utilities
// ---------------------------------------------------------------------------

function rgbToHex(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255).toString(16).padStart(2, '0');
  const g = Math.round(rgb[1] * 255).toString(16).padStart(2, '0');
  const b = Math.round(rgb[2] * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}
