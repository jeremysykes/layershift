/**
 * Entry point for Layershift Web Components.
 *
 * Importing this module registers all effect elements with the browser:
 * - <layershift-parallax> — Depth-aware parallax video effect
 * - <layershift-portal> — Logo-shaped video portal with depth parallax
 */

import { LayershiftElement } from './layershift-element';
import { LayershiftPortalElement } from './portal-element';

if (!customElements.get(LayershiftElement.TAG_NAME)) {
  customElements.define(LayershiftElement.TAG_NAME, LayershiftElement);
}

if (!customElements.get(LayershiftPortalElement.TAG_NAME)) {
  customElements.define(LayershiftPortalElement.TAG_NAME, LayershiftPortalElement);
}

export { LayershiftElement };
export { LayershiftPortalElement };

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

export type { LayershiftPortalProps } from './types';
export type {
  LayershiftPortalEventMap,
  LayershiftPortalReadyDetail,
  LayershiftPortalPlayDetail,
  LayershiftPortalPauseDetail,
  LayershiftPortalLoopDetail,
  LayershiftPortalFrameDetail,
  LayershiftPortalErrorDetail,
} from './types';
