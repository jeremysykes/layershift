import type { Meta, StoryObj } from '@storybook/react-vite';

import { BackToTop } from './BackToTop';

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

export const Default: Story = {};
