import type { Meta, StoryObj } from '@storybook/react-vite';

import { EffectDots } from './EffectDots';
import { withStore } from '../../../../../.storybook/decorators/withStore';

/**
 * Dot indicators for mobile swipe — shows which effect is active.
 * Hidden on desktop via `sm:hidden` (Tailwind, ≥640px). Only renders
 * when multiple effects are enabled.
 *
 * Stories pass a custom `className` without `sm:hidden` so the dots
 * are visible at all viewport widths.
 */
const meta = {
  title: 'Atoms/EffectDots',
  component: EffectDots,
  tags: ['autodocs'],
  decorators: [withStore],
  args: {
    className: 'flex justify-center gap-2 mt-4',
  },
} satisfies Meta<typeof EffectDots>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Two enabled effects — one active dot (white), one inactive (dim). */
export const TwoEffects: Story = {
  parameters: {
    store: {
      activeEffect: 'parallax',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
      ],
    },
  },
};

/** Three enabled effects — active dot is in the middle. */
export const ThreeEffects: Story = {
  parameters: {
    store: {
      activeEffect: 'portal',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
        { id: 'portal', label: 'Portal', enabled: true },
        { id: 'morph', label: 'Morph', enabled: true },
      ],
    },
  },
};
