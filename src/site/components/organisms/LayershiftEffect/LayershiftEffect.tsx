import { createElement, useEffect, useRef } from 'react';

/** Map tag names to the ready event they fire. */
const READY_EVENTS: Record<string, string> = {
  'layershift-parallax': 'layershift-parallax:ready',
  'layershift-portal': 'layershift-portal:ready',
};

interface LayershiftEffectProps {
  tagName: string;
  attrs: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
  /** Called once when the Web Component fires its ready event. */
  onReady?: () => void;
}

/**
 * Renders a Layershift Web Component (<layershift-parallax> or <layershift-portal>)
 * with imperative attribute setting. Uses React.createElement to support dynamic
 * tag names and useEffect to set kebab-case attributes correctly.
 */
export function LayershiftEffect({ tagName, attrs, className, style, onReady }: LayershiftEffectProps) {
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

  return createElement(tagName, {
    ref,
    className,
    style: { width: '100%', height: '100%', ...style },
  });
}
