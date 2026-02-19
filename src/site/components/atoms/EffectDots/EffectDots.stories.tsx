import type { Meta, StoryObj } from '@storybook/react-vite';

import { EffectDots } from './EffectDots';
import { withStore } from '../../../../../.storybook/decorators/withStore';

const meta = {
  title: 'Atoms/EffectDots',
  component: EffectDots,
  tags: ['autodocs'],
  decorators: [withStore],
} satisfies Meta<typeof EffectDots>;

export default meta;
type Story = StoryObj<typeof meta>;

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
