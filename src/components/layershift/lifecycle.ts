/**
 * Shared lifecycle management for Layershift Web Components.
 *
 * Solves the fundamental tension between Custom Element lifecycle callbacks
 * (synchronous, DOM-driven) and React 19's rendering model (asynchronous
 * attribute setting via useEffect, Strict Mode double-invoke).
 *
 * ## Problems solved:
 *
 * 1. **Premature init**: `connectedCallback` fires before React sets attrs
 *    via `useEffect`. The element must NOT init until all required attrs exist.
 *
 * 2. **Concurrent inits**: Multiple `attributeChangedCallback` calls during
 *    a single React render cycle can each trigger `init()`. Without a guard,
 *    multiple async inits run concurrently, each creating WebGL contexts.
 *
 * 3. **Stale abort controller**: React Strict Mode unmount calls `dispose()`,
 *    nulling the abort controller. But the first init's Promise.all is still
 *    in flight. When it resumes, it checks `this.abortController` which now
 *    points to a NEW controller from the second init — the check passes
 *    incorrectly. Fix: per-invocation abort tokens.
 *
 * 4. **WebGL context leaks**: Renderers create WebGL contexts but `dispose()`
 *    never explicitly releases them. Orphaned contexts accumulate until the
 *    browser forcibly evicts the oldest, causing GL_INVALID_FRAMEBUFFER errors.
 *    Fix: explicit `WEBGL_lose_context.loseContext()` + canvas removal.
 *
 * 5. **Duplicate init on same-value setAttribute**: React Strict Mode
 *    remount sets the same attribute values, triggering `attributeChangedCallback`
 *    even though nothing changed. Fix: early return when oldVal === newVal.
 */

/**
 * Interface that Layershift elements must implement to use the lifecycle
 * manager. The lifecycle manager calls these methods at the right time.
 */
export interface ManagedElement {
  /** The attributes that trigger re-initialization when changed. */
  readonly reinitAttributes: string[];

  /** Set up the Shadow DOM structure (style + container). */
  setupShadowDOM(): void;

  /**
   * The actual initialization logic. Receives a per-invocation AbortSignal
   * that the element MUST check after every async operation. If the signal
   * is aborted, clean up partial state and return.
   */
  doInit(signal: AbortSignal): Promise<void>;

  /**
   * Clean up all resources: renderers, workers, video elements, etc.
   * Called by the lifecycle manager before re-init and on disconnect.
   * Does NOT need to handle the abort controller — the manager owns that.
   */
  doDispose(): void;

  /**
   * Optional custom readiness check. When provided, replaces the default
   * gate (all reinitAttributes must be present) with element-specific
   * logic — e.g. camera mode doesn't require src/depth-src/depth-meta.
   */
  canInit?(): boolean;
}

/**
 * Lifecycle state managed on behalf of the element. Attached as a private
 * field on each element instance.
 */
export class LifecycleManager {
  private abortController: AbortController | null = null;
  private initialized = false;
  private initializing = false;
  private element: HTMLElement & ManagedElement;

  constructor(element: HTMLElement & ManagedElement) {
    this.element = element;
  }

  // --- Public API (called from lifecycle callbacks) ---

  onConnected(): void {
    this.element.setupShadowDOM();
    void this.tryInit();
  }

  onDisconnected(): void {
    this.cancelInit();
    this.element.doDispose();
    this.initialized = false;
  }

  onAttributeChanged(name: string, oldVal: string | null, newVal: string | null): void {
    if (!this.element.reinitAttributes.includes(name)) return;
    if (oldVal === newVal) return;

    if (this.initialized) {
      this.cancelInit();
      this.element.doDispose();
      this.initialized = false;
      this.element.setupShadowDOM();
      void this.tryInit();
    } else if (!this.initializing) {
      void this.tryInit();
    }
  }

  get isInitialized(): boolean {
    return this.initialized;
  }

  markInitialized(): void {
    this.initialized = true;
    this.initializing = false;
  }

  // --- Internal ---

  private async tryInit(): Promise<void> {
    if (this.initializing) return;

    const el = this.element;
    if (!el.isConnected) return;

    if (el.canInit) {
      if (!el.canInit()) return;
    } else {
      for (const attr of el.reinitAttributes) {
        if (!el.getAttribute(attr)) return;
      }
    }

    this.cancelInit();

    const abortController = new AbortController();
    this.abortController = abortController;
    this.initializing = true;

    try {
      await el.doInit(abortController.signal);

      if (abortController.signal.aborted) {
        this.initializing = false;
        return;
      }
    } catch {
      this.initializing = false;
    }
  }

  private cancelInit(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.initializing = false;
  }
}

/**
 * Release a WebGL context explicitly to free GPU resources.
 * Call this in renderer dispose() methods.
 */
export function releaseWebGLContext(gl: WebGL2RenderingContext | WebGLRenderingContext | null): void {
  if (!gl) return;
  const ext = gl.getExtension('WEBGL_lose_context');
  ext?.loseContext();
}
