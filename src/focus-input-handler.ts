/**
 * Focus-aware input handler for the rack focus effect.
 *
 * Maps pointer/touch/scroll events to a scalar focal depth value via
 * a critically-damped spring. Separate from the existing InputHandler
 * (which outputs a 2D offset vector for parallax displacement).
 *
 * ## Focus modes
 *
 * - **auto**: Pointer-tracking on desktop, tap-to-focus on mobile.
 *   Reverts to autoFocusDepth on hover exit.
 * - **pointer**: Same tracking, but stays at last focused depth on exit.
 * - **scroll**: Focal depth driven by component scroll position.
 * - **programmatic**: No pointer/touch/scroll listeners. API-only control.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FocusInputConfig {
  mode: 'auto' | 'pointer' | 'scroll' | 'programmatic';
  /** Base transition duration for full near-to-far rack (ms). */
  transitionSpeed: number;
  /** Focus breathing amount during transitions. */
  breathAmount: number;
  /** Auto-focus depth from depth analysis. */
  autoFocusDepth: number;
}

export interface FocusState {
  /** Current focal depth after spring integration [0,1]. */
  focalDepth: number;
  /** Whether the spring is still settling. */
  transitioning: boolean;
  /** Transition progress 0..1 (0 = settled, ~1 = midway). */
  transitionProgress: number;
  /** Focus breathing UV scale (1.0 when idle). */
  breathScale: number;
  /** Focus breathing UV offset (0,0 when idle). */
  breathOffset: [number, number];
}

// ---------------------------------------------------------------------------
// Critically-damped spring
// ---------------------------------------------------------------------------

class CriticallyDampedSpring {
  private position: number;
  private velocity = 0;
  private target: number;

  private static readonly SETTLE_THRESHOLD = 0.001;

  constructor(initial: number) {
    this.position = initial;
    this.target = initial;
  }

  get value(): number { return this.position; }

  get settled(): boolean {
    return Math.abs(this.position - this.target) < CriticallyDampedSpring.SETTLE_THRESHOLD
        && Math.abs(this.velocity) < CriticallyDampedSpring.SETTLE_THRESHOLD;
  }

  get progress(): number {
    if (this.settled) return 0;
    const remaining = Math.abs(this.position - this.target);
    return 1.0 - Math.min(1.0, remaining * 5.0);
  }

  setTarget(target: number): void {
    this.target = clamp(target, 0, 1);
  }

  tick(dtSeconds: number, durationMs: number): void {
    if (this.settled) {
      this.position = this.target;
      this.velocity = 0;
      return;
    }

    // omega derived from desired settling time:
    // For critical damping, ~98% settled at t = 4/omega.
    const omega = 4000.0 / Math.max(durationMs, 1);
    const dt = Math.min(dtSeconds, 0.033);

    const displacement = this.position - this.target;
    const springForce = -omega * omega * displacement;
    const dampingForce = -2.0 * omega * this.velocity;

    this.velocity += (springForce + dampingForce) * dt;
    this.position += this.velocity * dt;

    if (this.settled) {
      this.position = this.target;
      this.velocity = 0;
    }
  }

  snapTo(value: number): void {
    this.position = clamp(value, 0, 1);
    this.target = this.position;
    this.velocity = 0;
  }
}

// ---------------------------------------------------------------------------
// Depth sampling
// ---------------------------------------------------------------------------

function sampleDepthAtUV(
  depthData: Uint8Array,
  u: number, v: number,
  width: number, height: number
): number {
  const px = Math.round(u * (width - 1));
  const py = Math.round(v * (height - 1));

  let sum = 0;
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const sx = Math.max(0, Math.min(width - 1, px + dx));
      const sy = Math.max(0, Math.min(height - 1, py + dy));
      sum += depthData[sy * width + sx];
      count++;
    }
  }

  return (sum / count) / 255;
}

// ---------------------------------------------------------------------------
// Transition timing
// ---------------------------------------------------------------------------

function computeTransitionDuration(
  fromDepth: number, toDepth: number, baseMs: number
): number {
  const delta = Math.abs(toDepth - fromDepth);
  const scaled = baseMs * Math.max(delta, 0.2);
  return Math.max(60, Math.min(500, scaled));
}

// ---------------------------------------------------------------------------
// FocusInputHandler
// ---------------------------------------------------------------------------

/** Minimum depth change to update spring target during pointer tracking (prevents jitter). */
const POINTER_HYSTERESIS = 0.03;

/** Minimum time (ms) focus must be locked before a click can unlock it. */
const LOCK_MIN_DURATION_MS = 400;

export class FocusInputHandler {
  private config: FocusInputConfig;
  private readonly spring: CriticallyDampedSpring;
  private depthWidth: number;
  private depthHeight: number;
  private lastTime: number | null = null;
  private currentTransitionDuration: number;
  private focusLocked = false;
  private focusLockedAt = 0;
  private lastPointerTarget = -1;

  // Scroll mode state
  private scrollObserver: IntersectionObserver | null = null;
  private scrollListenerAttached = false;
  private scrollVisibility = 0.5;

  constructor(
    private readonly host: HTMLElement,
    config: FocusInputConfig,
    depthWidth: number,
    depthHeight: number
  ) {
    this.config = { ...config };
    this.depthWidth = depthWidth;
    this.depthHeight = depthHeight;
    this.spring = new CriticallyDampedSpring(config.autoFocusDepth);
    this.currentTransitionDuration = config.transitionSpeed;

    this.attachListeners();
  }

  update(depthData: Uint8Array, currentTime: number): FocusState {
    const now = currentTime;
    const dt = this.lastTime !== null ? (now - this.lastTime) / 1000 : 0.016;
    this.lastTime = now;

    this.spring.tick(dt, this.currentTransitionDuration);

    const transitionProgress = this.spring.progress;
    const breathAmount = this.config.breathAmount;

    // Quadratic ease: peaks at progress~0.5, zero at 0.0 and 1.0.
    const breathScale = 1.0 + (transitionProgress * (1.0 - transitionProgress))
                             * breathAmount * 4.0;

    return {
      focalDepth: this.spring.value,
      transitioning: !this.spring.settled,
      transitionProgress,
      breathScale,
      breathOffset: [0.0, 0.0],
    };
  }

  setFocusDepth(depth: number, options?: { duration?: number }): void {
    const from = this.spring.value;
    const to = clamp(depth, 0, 1);
    this.currentTransitionDuration = options?.duration
      ?? computeTransitionDuration(from, to, this.config.transitionSpeed);
    this.spring.setTarget(to);
  }

  setFocusDepthInstant(depth: number): void {
    this.spring.snapTo(depth);
  }

  resetFocus(): void {
    this.focusLocked = false;
    this.lastPointerTarget = -1;
    const from = this.spring.value;
    const to = this.config.autoFocusDepth;
    this.currentTransitionDuration = computeTransitionDuration(from, to, this.config.transitionSpeed);
    this.spring.setTarget(to);
  }

  get currentFocalDepth(): number {
    return this.spring.value;
  }

  get isTransitioning(): boolean {
    return !this.spring.settled;
  }

  dispose(): void {
    this.detachListeners();
  }

  // --- Listener management ---

  private attachListeners(): void {
    if (this.config.mode === 'programmatic') return;

    if (this.config.mode === 'scroll') {
      this.attachScrollListeners();
      return;
    }

    // auto and pointer modes use pointer/touch events.
    this.host.addEventListener('pointermove', this.handlePointerMove);
    this.host.addEventListener('pointerleave', this.handlePointerLeave);
    this.host.addEventListener('click', this.handleClick);

    // Touch events
    this.host.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    this.host.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    this.host.addEventListener('touchend', this.handleTouchEnd, { passive: true });
  }

  private detachListeners(): void {
    this.host.removeEventListener('pointermove', this.handlePointerMove);
    this.host.removeEventListener('pointerleave', this.handlePointerLeave);
    this.host.removeEventListener('click', this.handleClick);
    this.host.removeEventListener('touchstart', this.handleTouchStart);
    this.host.removeEventListener('touchmove', this.handleTouchMove);
    this.host.removeEventListener('touchend', this.handleTouchEnd);

    if (this.scrollObserver) {
      this.scrollObserver.disconnect();
      this.scrollObserver = null;
    }
    if (this.scrollListenerAttached) {
      window.removeEventListener('scroll', this.handleScroll);
      this.scrollListenerAttached = false;
    }
  }

  // --- Pointer events ---

  private lastDepthData: Uint8Array | null = null;

  private sampleAtPointer(event: { clientX: number; clientY: number }, depthData?: Uint8Array): number | null {
    const data = depthData ?? this.lastDepthData;
    if (!data) return null;

    const rect = this.host.getBoundingClientRect();
    let u = (event.clientX - rect.left) / rect.width;
    let v = (event.clientY - rect.top) / rect.height;

    // Clamp inward by 5% to avoid edge artifacts.
    u = clamp(u, 0.05, 0.95);
    v = clamp(v, 0.05, 0.95);

    return sampleDepthAtUV(data, u, v, this.depthWidth, this.depthHeight);
  }

  /** Store latest depth data for pointer sampling. */
  updateDepthData(depthData: Uint8Array): void {
    this.lastDepthData = depthData;
  }

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return; // handled by touch events
    if (this.focusLocked) return;

    const depth = this.sampleAtPointer(event);
    if (depth === null) return;

    // Hysteresis: only update spring target if the new depth differs enough
    // from the last target. Prevents jitter from noisy depth at boundaries.
    if (this.lastPointerTarget >= 0 && Math.abs(depth - this.lastPointerTarget) < POINTER_HYSTERESIS) {
      return;
    }
    this.lastPointerTarget = depth;

    const from = this.spring.value;
    this.currentTransitionDuration = computeTransitionDuration(from, depth, this.config.transitionSpeed);
    this.spring.setTarget(depth);
  };

  private readonly handlePointerLeave = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    if (this.focusLocked) return;

    // Reset pointer tracking state so re-entry starts fresh.
    this.lastPointerTarget = -1;

    if (this.config.mode === 'auto') {
      // Revert to auto-focus depth.
      const from = this.spring.value;
      const to = this.config.autoFocusDepth;
      this.currentTransitionDuration = Math.max(
        computeTransitionDuration(from, to, this.config.transitionSpeed),
        300 // minimum 300ms for exit transition
      );
      this.spring.setTarget(to);
    }
    // In 'pointer' mode, stay at last focused depth.
  };

  private readonly handleClick = (event: MouseEvent) => {
    const depth = this.sampleAtPointer(event);
    if (depth === null) return;

    if (this.focusLocked) {
      // Require minimum lock duration before allowing unlock (prevents
      // accidental unlock from rapid clicks or double-clicks).
      const elapsed = performance.now() - this.focusLockedAt;
      if (elapsed < LOCK_MIN_DURATION_MS) return;

      // Click near the same depth → unlock (toggle behavior).
      if (Math.abs(depth - this.lastPointerTarget) < 0.08) {
        this.focusLocked = false;
        this.lastPointerTarget = -1;
        return;
      }
    }

    // Lock focus at clicked depth.
    this.focusLocked = true;
    this.focusLockedAt = performance.now();
    this.lastPointerTarget = depth;
    const from = this.spring.value;
    this.currentTransitionDuration = computeTransitionDuration(from, depth, this.config.transitionSpeed);
    this.spring.setTarget(depth);
  };

  // --- Touch events ---

  private readonly handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;

    const depth = this.sampleAtPointer(touch);
    if (depth === null) return;

    this.focusLocked = true;
    const from = this.spring.value;
    this.currentTransitionDuration = computeTransitionDuration(from, depth, this.config.transitionSpeed);
    this.spring.setTarget(depth);
  };

  private readonly handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;

    const depth = this.sampleAtPointer(touch);
    if (depth === null) return;

    const from = this.spring.value;
    this.currentTransitionDuration = computeTransitionDuration(from, depth, this.config.transitionSpeed);
    this.spring.setTarget(depth);
  };

  private readonly handleTouchEnd = () => {
    // Keep focus locked at last touched depth.
  };

  // --- Scroll mode ---

  private attachScrollListeners(): void {
    this.scrollObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          this.scrollVisibility = entry.intersectionRatio;
        }
      },
      { threshold: Array.from({ length: 21 }, (_, i) => i / 20) }
    );
    this.scrollObserver.observe(this.host);

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    this.scrollListenerAttached = true;
  }

  private readonly handleScroll = () => {
    const rect = this.host.getBoundingClientRect();
    const viewportHeight = window.innerHeight;

    // Map scroll position: element center at bottom = 0, at top = 1.
    const centerY = rect.top + rect.height / 2;
    const scrollProgress = clamp(1.0 - centerY / viewportHeight, 0, 1);

    // Map to depth: scrollProgress 0 → far (1.0), scrollProgress 1 → near (0.0).
    const depth = 1.0 - scrollProgress;

    const from = this.spring.value;
    this.currentTransitionDuration = computeTransitionDuration(from, depth, this.config.transitionSpeed);
    this.spring.setTarget(depth);
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
