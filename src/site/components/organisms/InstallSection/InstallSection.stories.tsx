import type { Meta, StoryObj } from '@storybook/react-vite';
import { InstallSection } from './InstallSection';

/**
 * "Get started" section with tabbed install instructions for npm, yarn,
 * pnpm, and CDN. Each tab shows a code snippet with a copy button.
 *
 * Self-contained component with no props or external store dependencies.
 * The tabs and copy buttons are fully interactive.
 */
const meta = {
  title: 'Organisms/InstallSection',
  component: InstallSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof InstallSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default install section with npm tab selected. */
export const Default: Story = {};
