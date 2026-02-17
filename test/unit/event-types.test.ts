/**
 * Unit tests for event type definitions and Web Component event dispatching.
 *
 * Since the full DepthParallaxElement requires WebGL, video loading, and
 * binary depth data, these tests validate the event type exports and the
 * emit() pattern in isolation.
 */

import { describe, it, expect } from 'vitest';
import type {
  DepthParallaxEventMap,
  DepthParallaxReadyDetail,
  DepthParallaxPlayDetail,
  DepthParallaxPauseDetail,
  DepthParallaxLoopDetail,
  DepthParallaxFrameDetail,
  DepthParallaxErrorDetail,
} from '../../src/components/depth-parallax/types';

// ---------------------------------------------------------------------------
// Type-level tests — these validate the type interfaces exist and are correct.
// If the types are wrong, TypeScript will fail to compile the test file.
// ---------------------------------------------------------------------------

describe('Event type definitions', () => {
  it('DepthParallaxReadyDetail has correct shape', () => {
    const detail: DepthParallaxReadyDetail = {
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 10.5,
    };
    expect(detail.videoWidth).toBe(1920);
    expect(detail.videoHeight).toBe(1080);
    expect(detail.duration).toBe(10.5);
  });

  it('DepthParallaxPlayDetail has correct shape', () => {
    const detail: DepthParallaxPlayDetail = { currentTime: 2.5 };
    expect(detail.currentTime).toBe(2.5);
  });

  it('DepthParallaxPauseDetail has correct shape', () => {
    const detail: DepthParallaxPauseDetail = { currentTime: 3.0 };
    expect(detail.currentTime).toBe(3.0);
  });

  it('DepthParallaxLoopDetail has correct shape', () => {
    const detail: DepthParallaxLoopDetail = { loopCount: 3 };
    expect(detail.loopCount).toBe(3);
  });

  it('DepthParallaxFrameDetail has correct shape', () => {
    const detail: DepthParallaxFrameDetail = {
      currentTime: 1.234,
      frameNumber: 42,
    };
    expect(detail.currentTime).toBe(1.234);
    expect(detail.frameNumber).toBe(42);
  });

  it('DepthParallaxErrorDetail has correct shape', () => {
    const detail: DepthParallaxErrorDetail = { message: 'test error' };
    expect(detail.message).toBe('test error');
  });

  it('DepthParallaxEventMap contains all event names', () => {
    // This is a compile-time check — if a key is missing, TS will error.
    type EventNames = keyof DepthParallaxEventMap;
    const names: EventNames[] = [
      'depth-parallax:ready',
      'depth-parallax:play',
      'depth-parallax:pause',
      'depth-parallax:loop',
      'depth-parallax:frame',
      'depth-parallax:error',
    ];
    expect(names).toHaveLength(6);
  });
});

// ---------------------------------------------------------------------------
// CustomEvent dispatching pattern tests
// ---------------------------------------------------------------------------

describe('CustomEvent dispatching pattern', () => {
  it('creates a composed, bubbling CustomEvent with detail', () => {
    const detail: DepthParallaxReadyDetail = {
      videoWidth: 1920,
      videoHeight: 1080,
      duration: 10.0,
    };

    const event = new CustomEvent('depth-parallax:ready', {
      detail,
      bubbles: true,
      composed: true,
    });

    expect(event.type).toBe('depth-parallax:ready');
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.detail).toEqual(detail);
  });

  it('event listeners receive the correct detail', () => {
    const el = document.createElement('div');
    let receivedDetail: DepthParallaxFrameDetail | null = null;

    el.addEventListener('depth-parallax:frame', ((e: CustomEvent<DepthParallaxFrameDetail>) => {
      receivedDetail = e.detail;
    }) as EventListener);

    el.dispatchEvent(
      new CustomEvent('depth-parallax:frame', {
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
    parent.addEventListener('depth-parallax:play', () => {
      parentReceived = true;
    });

    child.dispatchEvent(
      new CustomEvent('depth-parallax:play', {
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

    el.addEventListener('depth-parallax:error', ((e: CustomEvent<DepthParallaxErrorDetail>) => {
      errorMessage = e.detail.message;
    }) as EventListener);

    el.dispatchEvent(
      new CustomEvent('depth-parallax:error', {
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

    el.addEventListener('depth-parallax:loop', ((e: CustomEvent<DepthParallaxLoopDetail>) => {
      loopCounts.push(e.detail.loopCount);
    }) as EventListener);

    // Simulate 3 loops
    for (let i = 1; i <= 3; i++) {
      el.dispatchEvent(
        new CustomEvent('depth-parallax:loop', {
          detail: { loopCount: i },
          bubbles: true,
          composed: true,
        })
      );
    }

    expect(loopCounts).toEqual([1, 2, 3]);
  });
});
