import { Component, createRef, type ReactNode } from 'react';

/**
 * Custom error events fired by Layershift Web Components on init failure.
 * When adding a new effect, add its error event name here.
 */
const EFFECT_ERROR_EVENTS = [
  'layershift-parallax:error',
  'layershift-portal:error',
];

interface Props {
  children: ReactNode;
  /** Rendered in place of children when an error occurs. */
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Catches two categories of failure around Layershift effect rendering:
 *
 * 1. React render errors (getDerivedStateFromError / componentDidCatch)
 * 2. Web Component initialization errors — WebGL context creation failure,
 *    video decode errors, missing attributes — which fire as bubbling
 *    custom events (e.g. "layershift-parallax:error").
 *
 * Both show the same caller-provided fallback UI.
 */
export class EffectErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };
  private wrapperRef = createRef<HTMLDivElement>();

  private handleEffectError = () => {
    if (!this.state.hasError) {
      this.setState({ hasError: true });
    }
  };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidMount() {
    const el = this.wrapperRef.current;
    if (!el) return;
    for (const event of EFFECT_ERROR_EVENTS) {
      el.addEventListener(event, this.handleEffectError);
    }
  }

  componentWillUnmount() {
    const el = this.wrapperRef.current;
    if (!el) return;
    for (const event of EFFECT_ERROR_EVENTS) {
      el.removeEventListener(event, this.handleEffectError);
    }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return (
      <div ref={this.wrapperRef} style={{ width: '100%', height: '100%' }}>
        {this.props.children}
      </div>
    );
  }
}
