/**
 * JSX IntrinsicElements declarations for Layershift custom elements.
 *
 * Reference this file in your tsconfig.json to get TypeScript support
 * for the custom elements in React/JSX projects:
 *
 *   "compilerOptions": {
 *     "types": ["layershift/global"]
 *   }
 */

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
      'layershift-rack-focus': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          'depth-src'?: string;
          'depth-meta'?: string;
          'depth-model'?: string;
          'source-type'?: 'video' | 'image' | 'camera';
          'focus-mode'?: 'auto' | 'pointer' | 'scroll' | 'programmatic';
          'focus-depth'?: number | string;
          'focus-range'?: number | string;
          'transition-speed'?: number | string;
          aperture?: number | string;
          'max-blur'?: number | string;
          'depth-scale'?: number | string;
          'highlight-bloom'?: boolean | string;
          'highlight-threshold'?: number | string;
          'focus-breathing'?: number | string;
          vignette?: number | string;
          quality?: 'auto' | 'high' | 'medium' | 'low';
          'gpu-backend'?: 'auto' | 'webgpu' | 'webgl2';
          autoplay?: boolean | string;
          loop?: boolean | string;
          muted?: boolean | string;
        },
        HTMLElement
      >;
    }
  }
}

export {};
