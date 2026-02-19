import { createElement, useEffect, useRef } from 'react';

interface LayershiftEffectProps {
  tagName: string;
  attrs: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Renders a Layershift Web Component (<layershift-parallax> or <layershift-portal>)
 * with imperative attribute setting. Uses React.createElement to support dynamic
 * tag names and useEffect to set kebab-case attributes correctly.
 */
export function LayershiftEffect({ tagName, attrs, className, style }: LayershiftEffectProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Set all attributes
    for (const [key, val] of Object.entries(attrs)) {
      el.setAttribute(key, val);
    }
  }, [attrs]);

  return createElement(tagName, {
    ref,
    className,
    style: { width: '100%', height: '100%', ...style },
  });
}
