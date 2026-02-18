/**
 * JSX IntrinsicElements declaration for the <layershift-parallax> custom element.
 *
 * Reference this file in your tsconfig.json to get TypeScript support
 * for the custom element in React/JSX projects:
 *
 *   "compilerOptions": {
 *     "types": ["layershift/global"]
 *   }
 */

import type { LayershiftProps } from './types';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'layershift-parallax': React.DetailedHTMLProps<
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
