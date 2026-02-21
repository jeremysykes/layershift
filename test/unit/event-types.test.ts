/**
 * Unit tests for event type definitions and Web Component event dispatching.
 *
 * Since the full LayershiftElement requires WebGL, video loading, and
 * binary depth data, these tests validate the event type exports and the
 * emit() pattern in isolation.
 */

import { describe, it, expect } from 'vitest';
import type {
  LayershiftEventMap,
  LayershiftReadyDetail,
  LayershiftPlayDetail,
  LayershiftPauseDetail,
  LayershiftLoopDetail,
  LayershiftFrameDetail,
  LayershiftErrorDetail,
  LayershiftModelProgressDetail,
} from '../../src/components/layershift/types';

// ---------------------------------------------------------------------------
// Type-level tests — these validate the type interfaces exist and are correct.
// If the types are wrong, TypeScript will fail to compile the test file.
// ---------------------------------------------------------------------------

describe('Event type definitions', () => {
  it('LayershiftReadyDetail has correct shape', () => {
    const detail: LayershiftReadyDetail = {
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 10.5,
    };
    expect(detail.videoWidth).toBe(1920);
    expect(detail.videoHeight).toBe(1080);
    expect(detail.duration).toBe(10.5);
  });

  it('LayershiftPlayDetail has correct shape', () => {
    const detail: LayershiftPlayDetail = { currentTime: 2.5 };
    expect(detail.currentTime).toBe(2.5);
  });

  it('LayershiftPauseDetail has correct shape', () => {
    const detail: LayershiftPauseDetail = { currentTime: 3.0 };
    expect(detail.currentTime).toBe(3.0);
  });

  it('LayershiftLoopDetail has correct shape', () => {
    const detail: LayershiftLoopDetail = { loopCount: 3 };
    expect(detail.loopCount).toBe(3);
  });

  it('LayershiftFrameDetail has correct shape', () => {
    const detail: LayershiftFrameDetail = {
      currentTime: 1.234,
      frameNumber: 42,
    };
    expect(detail.currentTime).toBe(1.234);
    expect(detail.frameNumber).toBe(42);
  });

  it('LayershiftErrorDetail has correct shape', () => {
    const detail: LayershiftErrorDetail = { message: 'test error' };
    expect(detail.message).toBe('test error');
  });

  it('LayershiftModelProgressDetail has correct shape', () => {
    const detail: LayershiftModelProgressDetail = {
      receivedBytes: 5_000_000,
      totalBytes: 19_000_000,
      fraction: 0.26,
      label: 'Downloading depth model\u2026',
    };
    expect(detail.receivedBytes).toBe(5_000_000);
    expect(detail.totalBytes).toBe(19_000_000);
    expect(detail.fraction).toBeCloseTo(0.26);
    expect(detail.label).toBe('Downloading depth model\u2026');
  });

  it('LayershiftEventMap contains all event names', () => {
    // This is a compile-time check — if a key is missing, TS will error.
    type EventNames = keyof LayershiftEventMap;
    const names: EventNames[] = [
      'layershift-parallax:ready',
      'layershift-parallax:play',
      'layershift-parallax:pause',
      'layershift-parallax:loop',
      'layershift-parallax:frame',
      'layershift-parallax:error',
      'layershift-parallax:model-progress',
    ];
    expect(names).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// CustomEvent dispatching pattern tests
// ---------------------------------------------------------------------------

describe('CustomEvent dispatching pattern', () => {
  it('creates a composed, bubbling CustomEvent with detail', () => {
    const detail: LayershiftReadyDetail = {
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 10.0,
    };

    const event = new CustomEvent('layershift-parallax:ready', {
      detail,
      bubbles: true,
      composed: true,
    });

    expect(event.type).toBe('layershift-parallax:ready');
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.detail).toEqual(detail);
  });

  it('event listeners receive the correct detail', () => {
    const el = document.createElement('div');
    let receivedDetail: LayershiftFrameDetail | null = null;

    el.addEventListener('layershift-parallax:frame', ((e: CustomEvent<LayershiftFrameDetail>) => {
      receivedDetail = e.detail;
    }) as EventListener);

    el.dispatchEvent(
      new CustomEvent('layershift-parallax:frame', {
        detail: { currentTime: 5.0, frameNumber: 150 },
        bubbles: true,
        composed: true,
      })
    );

    expect(receivedDetail).toEqual({ currentTime: 5.0, frameNumber: 150 });
  });

  it('events bubble up through the DOM', () => {
    const parent = document.createElement('div');
    const child = document.createElement('div');
    parent.appendChild(child);
    document.body.appendChild(parent);

    let parentReceived = false;
    parent.addEventListener('layershift-parallax:play', () => {
      parentReceived = true;
    });

    child.dispatchEvent(
      new CustomEvent('layershift-parallax:play', {
        detail: { currentTime: 0 },
        bubbles: true,
        composed: true,
      })
    );

    expect(parentReceived).toBe(true);
    parent.remove();
  });

  it('error event carries message', () => {
    const el = document.createElement('div');
    let errorMessage = '';

    el.addEventListener('layershift-parallax:error', ((e: CustomEvent<LayershiftErrorDetail>) => {
      errorMessage = e.detail.message;
    }) as EventListener);

    el.dispatchEvent(
      new CustomEvent('layershift-parallax:error', {
        detail: { message: 'Failed to load video' },
        bubbles: true,
        composed: true,
      })
    );

    expect(errorMessage).toBe('Failed to load video');
  });

  it('loop event tracks loop count correctly', () => {
    const el = document.createElement('div');
    const loopCounts: number[] = [];

    el.addEventListener('layershift-parallax:loop', ((e: CustomEvent<LayershiftLoopDetail>) => {
      loopCounts.push(e.detail.loopCount);
    }) as EventListener);

    // Simulate 3 loops
    for (let i = 1; i <= 3; i++) {
      el.dispatchEvent(
        new CustomEvent('layershift-parallax:loop', {
          detail: { loopCount: i },
          bubbles: true,
          composed: true,
        })
      );
    }

    expect(loopCounts).toEqual([1, 2, 3]);
  });
});
