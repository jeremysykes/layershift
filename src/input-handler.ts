export interface ParallaxInput {
  x: number;
  y: number;
}

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

/** Pixels of finger drag to reach full parallax offset (-1 or 1). */
const TOUCH_DRAG_RANGE = 100;

export class InputHandler {
  private pointerTarget: ParallaxInput = { x: 0, y: 0 };
  private motionTarget: ParallaxInput = { x: 0, y: 0 };
  private smoothedOutput: ParallaxInput = { x: 0, y: 0 };
  private usingMotionInput = false;
  private motionListenerAttached = false;
  private touchActive = false;
  private touchAnchorX = 0;
  private touchAnchorY = 0;

  constructor(private readonly motionLerpFactor: number) {
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseleave', this.resetPointerTarget);
    window.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    window.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    window.addEventListener('touchcancel', this.handleTouchEnd, { passive: true });
  }

  get isMotionSupported(): boolean {
    // DeviceOrientationEvent must exist for gyroscope-based parallax.
    if (typeof DeviceOrientationEvent === 'undefined') {
      return false;
    }

    // On desktop browsers, DeviceOrientationEvent is defined but no
    // gyroscope hardware exists. Use touch capability + coarse pointer
    // as a proxy for "this is a phone or tablet with a gyroscope".
    // Requiring both avoids false positives on touchscreen laptops
    // (which have touch but primary pointer is fine/mouse).
    const hasTouch =
      'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const hasCoarsePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    return hasTouch && hasCoarsePointer;
  }

  get isMotionEnabled(): boolean {
    return this.usingMotionInput;
  }

  async enableMotionControls(): Promise<boolean> {
    if (!this.isMotionSupported) {
      return false;
    }

    const motionEvent = DeviceOrientationEvent as IOSDeviceOrientationEvent;
    if (typeof motionEvent.requestPermission === 'function') {
      const result = await motionEvent.requestPermission();
      if (result !== 'granted') {
        return false;
      }
    }

    if (!this.motionListenerAttached) {
      window.addEventListener('deviceorientation', this.handleDeviceOrientation);
      this.motionListenerAttached = true;
    }

    this.usingMotionInput = true;
    return true;
  }

  update(): ParallaxInput {
    // Priority: touch (finger on screen) > gyro > mouse
    const target = this.touchActive
      ? this.pointerTarget
      : this.usingMotionInput
        ? this.motionTarget
        : this.pointerTarget;
    this.smoothedOutput.x = lerp(
      this.smoothedOutput.x,
      target.x,
      this.motionLerpFactor
    );
    this.smoothedOutput.y = lerp(
      this.smoothedOutput.y,
      target.y,
      this.motionLerpFactor
    );

    return this.smoothedOutput;
  }

  dispose(): void {
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mouseleave', this.resetPointerTarget);
    window.removeEventListener('touchstart', this.handleTouchStart);
    window.removeEventListener('touchmove', this.handleTouchMove);
    window.removeEventListener('touchend', this.handleTouchEnd);
    window.removeEventListener('touchcancel', this.handleTouchEnd);
    if (this.motionListenerAttached) {
      window.removeEventListener('deviceorientation', this.handleDeviceOrientation);
      this.motionListenerAttached = false;
    }
  }

  private readonly handleMouseMove = (event: MouseEvent) => {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = (event.clientY / window.innerHeight) * 2 - 1;
    this.pointerTarget.x = clamp(x, -1, 1);
    this.pointerTarget.y = clamp(y, -1, 1);
  };

  private readonly resetPointerTarget = () => {
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
  };

  private readonly handleTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    this.touchActive = true;
    this.touchAnchorX = touch.clientX;
    this.touchAnchorY = touch.clientY;
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
  };

  private readonly handleTouchMove = (event: TouchEvent) => {
    const touch = event.touches[0];
    if (!touch) return;
    const dx = touch.clientX - this.touchAnchorX;
    const dy = touch.clientY - this.touchAnchorY;
    this.pointerTarget.x = clamp(dx / TOUCH_DRAG_RANGE, -1, 1);
    this.pointerTarget.y = clamp(dy / TOUCH_DRAG_RANGE, -1, 1);
  };

  private readonly handleTouchEnd = () => {
    this.touchActive = false;
    this.pointerTarget.x = 0;
    this.pointerTarget.y = 0;
  };

  private readonly handleDeviceOrientation = (event: DeviceOrientationEvent) => {
    // Typical comfortable range for handheld tilt.
    const rawX = clamp((event.gamma ?? 0) / 45, -1, 1);
    const rawY = clamp((event.beta ?? 0) / 45, -1, 1);

    this.motionTarget.x = lerp(this.motionTarget.x, rawX, this.motionLerpFactor);
    this.motionTarget.y = lerp(this.motionTarget.y, rawY, this.motionLerpFactor);
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}
