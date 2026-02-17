/**
 * Entry point for the <depth-parallax> Web Component.
 *
 * Importing this module registers the custom element with the browser.
 * After registration, <depth-parallax> can be used in any HTML document.
 */

import { DepthParallaxElement } from './depth-parallax-element';

if (!customElements.get(DepthParallaxElement.TAG_NAME)) {
  customElements.define(DepthParallaxElement.TAG_NAME, DepthParallaxElement);
}

export { DepthParallaxElement };
export type { DepthParallaxProps } from './types';
export type {
  DepthParallaxEventMap,
  DepthParallaxReadyDetail,
  DepthParallaxPlayDetail,
  DepthParallaxPauseDetail,
  DepthParallaxLoopDetail,
  DepthParallaxFrameDetail,
  DepthParallaxErrorDetail,
} from './types';
