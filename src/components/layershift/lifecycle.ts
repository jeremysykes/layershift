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

  /** Call from `connectedCallback`. Sets up Shadow DOM only — no init. */
  onConnected(): void {
    this.element.setupShadowDOM();
    // Do NOT call init here. Attributes may not be set yet.
    // Init is triggered by onAttributeChanged once all required attrs exist.
  }

  /** Call from `disconnectedCallback`. Cancels in-flight init + disposes. */
  onDisconnected(): void {
    this.cancelInit();
    this.element.doDispose();
    this.initialized = false;
  }

  /**
   * Call from `attributeChangedCallback`. Handles the guard logic:
   * - Skips non-reinit attributes
   * - Skips same-value changes
   * - Re-inits if already initialized
   * - First-inits once all required attrs are present (deduped)
   */
  onAttributeChanged(name: string, oldVal: string | null, newVal: string | null): void {
    // Only react to reinit-triggering attributes
    if (!this.element.reinitAttributes.includes(name)) return;

    // Skip no-op changes (e.g., React Strict Mode remount setting same values)
    if (oldVal === newVal) return;

    if (this.initialized) {
      // Source changed on an active instance — tear down and re-init
      this.cancelInit();
      this.element.doDispose();
      this.initialized = false;
      this.element.setupShadowDOM();
      void this.tryInit();
    } else if (!this.initializing) {
      // Not yet initialized and no init in flight — try if all attrs ready
      void this.tryInit();
    }
    // If initializing is true, we let the current init finish.
    // It will pick up the latest attribute values.
  }

  /** Whether the element has completed initialization. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Mark initialization as complete. Call at the end of doInit(). */
  markInitialized(): void {
    this.initialized = true;
    this.initializing = false;
  }

  // --- Internal ---

  /**
   * Attempt initialization if the element is connected and all required
   * attributes are present. Uses an initializing guard to prevent
   * concurrent init calls.
   */
  private async tryInit(): Promise<void> {
    if (this.initializing) return;

    const el = this.element;
    if (!el.isConnected) return;

    // Check all required reinit attributes are present
    for (const attr of el.reinitAttributes) {
      if (!el.getAttribute(attr)) return;
    }

    // Cancel any previous in-flight init
    this.cancelInit();

    // Create a per-invocation abort controller
    const abortController = new AbortController();
    this.abortController = abortController;
    this.initializing = true;

    try {
      await el.doInit(abortController.signal);

      // If signal was aborted during init, doInit should have returned
      // early. But double-check to avoid marking as initialized.
      if (abortController.signal.aborted) {
        this.initializing = false;
        return;
      }

      // doInit calls markInitialized() on success
    } catch (err) {
      // doInit is responsible for error handling/emission.
      // Just clean up the initializing flag.
      this.initializing = false;
    }
  }

  /** Abort any in-flight init. */
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
