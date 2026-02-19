import type { Meta, StoryObj } from '@storybook/react-vite';
import { Footer } from './Footer';

/**
 * Site footer with attribution, Docs link, and GitHub icon.
 * Self-contained component with no props or store dependencies.
 */
const meta = {
  title: 'Organisms/Footer',
  component: Footer,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof Footer>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default footer rendering. */
export const Default: Story = {};
