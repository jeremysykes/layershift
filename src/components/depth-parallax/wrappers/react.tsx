import React, { useRef, useEffect } from 'react';
import '../index'; // registers the custom element
import type { DepthParallaxProps } from '../types';

export function DepthParallax({
  src,
  depthSrc,
  depthMeta,
  parallaxX,
  parallaxY,
  parallaxMax,
  layers,
  overscan,
  autoplay = true,
  loop = true,
  muted = true,
  className,
  style,
  ...rest
}: DepthParallaxProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Set properties that don't map cleanly as attributes
  }, []);

  return (
    <depth-parallax
      ref={ref}
      src={src}
      depth-src={depthSrc}
      depth-meta={depthMeta}
      parallax-x={parallaxX}
      parallax-y={parallaxY}
      parallax-max={parallaxMax}
      layers={layers}
      overscan={overscan}
      autoplay={autoplay ? '' : undefined}
      loop={loop ? '' : undefined}
      muted={muted ? '' : undefined}
      class={className}
      style={style}
      {...rest}
    />
  );
}
