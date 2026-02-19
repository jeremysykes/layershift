import type { Meta, StoryObj } from '@storybook/react-vite';

import { EffectSelector } from './EffectSelector';
import { withStore } from '../../../../../.storybook/decorators/withStore';

/**
 * Effect selector nav — tab bar that switches between enabled effects.
 * Returns `null` when only one effect is enabled (nothing to switch
 * between), so all stories use two or more effects.
 */
const meta = {
  title: 'Molecules/EffectSelector',
  component: EffectSelector,
  tags: ['autodocs'],
  decorators: [withStore],
  argTypes: {
    compact: { control: 'boolean' },
  },
} satisfies Meta<typeof EffectSelector>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Full-size tab bar with two effect tabs. */
export const Default: Story = {
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

/** Compact variant used inside the StickyNav — smaller text, no border. */
export const Compact: Story = {
  args: {
    compact: true,
  },
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

/** Three effects — demonstrates how the tab bar scales. */
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
