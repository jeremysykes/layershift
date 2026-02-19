import type { Meta, StoryObj } from '@storybook/react-vite';

import { HeroCta } from './HeroCta';

const meta = {
  title: 'Molecules/HeroCta',
  component: HeroCta,
  tags: ['autodocs'],
  parameters: {
    layout: 'fullscreen',
  },
} satisfies Meta<typeof HeroCta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
