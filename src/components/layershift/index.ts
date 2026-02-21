/**
 * Entry point for Layershift Web Components.
 *
 * Importing this module registers all effect elements with the browser:
 * - <layershift-parallax> — Depth-aware parallax video effect
 * - <layershift-rack-focus> — Depth-aware bokeh blur (rack focus) effect
 * - <layershift-portal> — Logo-shaped video portal with depth parallax
 */

import { LayershiftElement } from './layershift-element';
import { LayershiftRackFocusElement } from './rack-focus-element';
import { LayershiftPortalElement } from './portal-element';

if (!customElements.get(LayershiftElement.TAG_NAME)) {
  customElements.define(LayershiftElement.TAG_NAME, LayershiftElement);
}

if (!customElements.get(LayershiftRackFocusElement.TAG_NAME)) {
  customElements.define(LayershiftRackFocusElement.TAG_NAME, LayershiftRackFocusElement);
}

if (!customElements.get(LayershiftPortalElement.TAG_NAME)) {
  customElements.define(LayershiftPortalElement.TAG_NAME, LayershiftPortalElement);
}

export { LayershiftElement };
export { LayershiftRackFocusElement };
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

export type { LayershiftRackFocusProps } from './types';
export type {
  LayershiftRackFocusEventMap,
  RackFocusReadyDetail,
  RackFocusFocusChangeDetail,
  RackFocusFocusSettledDetail,
  RackFocusPlayDetail,
  RackFocusPauseDetail,
  RackFocusLoopDetail,
  RackFocusFrameDetail,
  RackFocusErrorDetail,
} from './types';
