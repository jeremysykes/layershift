import { useEffect } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { BackToTop } from './BackToTop';

/**
 * Floating back-to-top button. In production it fades in after scrolling
 * past the hero (`window.scrollY > window.innerHeight`).
 *
 * The Default story simulates a scrolled state so the button becomes
 * visible naturally through its own scroll listener.
 */
const meta = {
  title: 'Atoms/BackToTop',
  component: BackToTop,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof BackToTop>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Decorator that simulates a scrolled-past-hero state. Temporarily
 * overrides `window.scrollY` to exceed `window.innerHeight`, then
 * fires a scroll event so the component's listener picks it up.
 */
function withSimulatedScroll(Story: React.ComponentType) {
  useEffect(() => {
    const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
    Object.defineProperty(window, 'scrollY', {
      value: window.innerHeight + 100,
      configurable: true,
    });
    window.dispatchEvent(new Event('scroll'));

    return () => {
      if (original) {
        Object.defineProperty(window, 'scrollY', original);
      } else {
        delete (window as unknown as Record<string, unknown>).scrollY;
      }
    };
  }, []);

  return (
    <div style={{ position: 'relative', height: '200px', background: '#0a0a0a' }}>
      <Story />
    </div>
  );
}

/** Button visible after simulating a scroll past the hero. */
export const Default: Story = {
  decorators: [withSimulatedScroll],
};
