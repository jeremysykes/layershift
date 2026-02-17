/**
 * JSX IntrinsicElements declaration for the <depth-parallax> custom element.
 *
 * Reference this file in your tsconfig.json to get TypeScript support
 * for the custom element in React/JSX projects:
 *
 *   "compilerOptions": {
 *     "types": ["depth-parallax/global"]
 *   }
 */

import type { DepthParallaxProps } from './types';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'depth-parallax': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          'depth-src'?: string;
          'depth-meta'?: string;
          'parallax-x'?: number | string;
          'parallax-y'?: number | string;
          'parallax-max'?: number | string;
          layers?: number | string;
          overscan?: number | string;
          autoplay?: boolean | string;
          loop?: boolean | string;
          muted?: boolean | string;
        },
        HTMLElement
      >;
    }
  }
}
