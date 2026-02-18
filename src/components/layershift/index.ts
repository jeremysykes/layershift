/**
 * Entry point for the <layershift-parallax> Web Component.
 *
 * Importing this module registers the custom element with the browser.
 * After registration, <layershift-parallax> can be used in any HTML document.
 */

import { LayershiftElement } from './layershift-element';

if (!customElements.get(LayershiftElement.TAG_NAME)) {
  customElements.define(LayershiftElement.TAG_NAME, LayershiftElement);
}

export { LayershiftElement };
export type { LayershiftProps } from './types';
export type {
  LayershiftEventMap,
  LayershiftReadyDetail,
  LayershiftPlayDetail,
  LayershiftPauseDetail,
  LayershiftLoopDetail,
  LayershiftFrameDetail,
  LayershiftErrorDetail,
} from './types';
