import { createElement, useEffect, useRef } from 'react';

/** Map tag names to the ready event they fire. */
const READY_EVENTS: Record<string, string> = {
  'layershift-parallax': 'layershift-parallax:ready',
  'layershift-portal': 'layershift-portal:ready',
};

/** Map tag names to the model-progress event they fire. */
const MODEL_PROGRESS_EVENTS: Record<string, string> = {
  'layershift-parallax': 'layershift-parallax:model-progress',
  'layershift-portal': 'layershift-portal:model-progress',
};

/** Model download progress detail from the Web Component. */
export interface ModelProgressDetail {
  receivedBytes: number;
  totalBytes: number | null;
  fraction: number;
  label: string;
}

interface LayershiftEffectProps {
  tagName: string;
  attrs: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
  /** Called once when the Web Component fires its ready event. */
  onReady?: () => void;
  /** Called during model download with progress updates. */
  onModelProgress?: (detail: ModelProgressDetail) => void;
}

/**
 * Renders a Layershift Web Component (<layershift-parallax> or <layershift-portal>)
 * with imperative attribute setting. Uses React.createElement to support dynamic
 * tag names and useEffect to set kebab-case attributes correctly.
 */
export function LayershiftEffect({ tagName, attrs, className, style, onReady, onModelProgress }: LayershiftEffectProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set all attributes
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
  }, [attrs]);

  // Listen for the Web Component's ready event.
  useEffect(() => {
    const el = ref.current;
    if (!el || !onReady) return;

    const eventName = READY_EVENTS[tagName];
    if (!eventName) return;

    const handler = () => onReady();
    el.addEventListener(eventName, handler, { once: true });
    return () => el.removeEventListener(eventName, handler);
  }, [tagName, onReady]);

  // Listen for model download progress events.
  useEffect(() => {
    const el = ref.current;
    if (!el || !onModelProgress) return;

    const eventName = MODEL_PROGRESS_EVENTS[tagName];
    if (!eventName) return;

    const handler = (e: Event) => {
      const detail = (e as CustomEvent<ModelProgressDetail>).detail;
      onModelProgress(detail);
    };
    el.addEventListener(eventName, handler);
    return () => el.removeEventListener(eventName, handler);
  }, [tagName, onModelProgress]);

  return createElement(tagName, {
    ref,
    className,
    style: { width: '100%', height: '100%', ...style },
  });
}
