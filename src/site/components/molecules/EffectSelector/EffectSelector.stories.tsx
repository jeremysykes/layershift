import type { Meta, StoryObj } from '@storybook/react-vite';

import { EffectSelector } from './EffectSelector';
import { withStore } from '../../../../../.storybook/decorators/withStore';

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

export const SingleEffect: Story = {
  parameters: {
    store: {
      activeEffect: 'parallax',
      effects: [
        { id: 'parallax', label: 'Depth Parallax', enabled: true },
      ],
    },
  },
};
