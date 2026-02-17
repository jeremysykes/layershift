export interface DepthParallaxProps {
  src: string;
  depthSrc: string;
  depthMeta: string;
  parallaxX?: number;
  parallaxY?: number;
  parallaxMax?: number;
  layers?: number;
  overscan?: number;
  autoplay?: boolean;
  loop?: boolean;
  muted?: boolean;
  className?: string;
  style?: Record<string, string>;
}
