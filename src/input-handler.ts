export interface ParallaxInput {
  x: number;
  y: number;
}

type IOSDeviceOrientationEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export class InputHandler {
  private pointerTarget: ParallaxInput = { x: 0, y: 0 };
  private motionTarget: ParallaxInput = { x: 0, y: 0 };
  private smoothedOutput: ParallaxInput = { x: 0, y: 0 };
  private usingMotionInput = false;
  private motionListenerAttached = false;

  constructor(private readonly motionLerpFactor: number) {
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mouseleave', this.resetPointerTarget);
  }

  get isMotionSupported(): boolean {
    return typeof DeviceOrientationEvent !== 'undefined';
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
    const target = this.usingMotionInput ? this.motionTarget : this.pointerTarget;
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
