import type { Meta, StoryObj } from '@storybook/react-vite';
import { EffectErrorBoundary } from './EffectErrorBoundary';

/** A child component that always throws during render. */
function ThrowingChild() {
  throw new Error('Simulated render error');
  return null;
}

/**
 * Error boundary that catches two categories of failure:
 *
 * 1. **React render errors** via `getDerivedStateFromError` /
 *    `componentDidCatch`.
 * 2. **Web Component initialization errors** — WebGL context creation
 *    failure, video decode errors, missing attributes — which fire as
 *    bubbling custom events (`layershift-parallax:error`,
 *    `layershift-portal:error`).
 *
 * Both paths display the caller-provided `fallback` UI.
 */
const meta = {
  title: 'Organisms/EffectErrorBoundary',
  component: EffectErrorBoundary,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof EffectErrorBoundary>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Normal state — children render without error. */
export const Normal: Story = {
  args: {
    children: (
      <div
        style={{
          padding: '2rem',
          color: '#ccc',
          textAlign: 'center',
          border: '1px dashed #333',
          borderRadius: '8px',
        }}
      >
        Effect content renders here without error.
      </div>
    ),
    fallback: (
      <div style={{ padding: '2rem', color: '#f44', textAlign: 'center' }}>
        Something went wrong.
      </div>
    ),
  },
};

/** Error state — a child throws during render, triggering the fallback. */
export const WithError: Story = {
  args: {
    children: <ThrowingChild />,
    fallback: (
      <div
        style={{
          padding: '2rem',
          color: '#f44',
          textAlign: 'center',
          border: '1px dashed #f44',
          borderRadius: '8px',
        }}
      >
        Could not load effect demo — fallback UI is shown.
      </div>
    ),
  },
};

/** Minimal fallback — short message with the same visual treatment. */
export const MinimalFallback: Story = {
  args: {
    children: <ThrowingChild />,
    fallback: (
      <div
        style={{
          padding: '2rem',
          color: '#f44',
          textAlign: 'center',
          fontSize: '0.85rem',
          border: '1px dashed #f44',
          borderRadius: '8px',
        }}
      >
        Error
      </div>
    ),
  },
};
