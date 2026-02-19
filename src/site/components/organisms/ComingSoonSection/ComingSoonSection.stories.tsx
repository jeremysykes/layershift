import type { Meta, StoryObj } from '@storybook/react-vite';
import { ComingSoonSection } from './ComingSoonSection';

/**
 * Placeholder section indicating more effects are in development.
 * Contains a heading, description, and "Star on GitHub" link.
 *
 * Self-contained component with no props or store dependencies.
 */
const meta = {
  title: 'Organisms/ComingSoonSection',
  component: ComingSoonSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof ComingSoonSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Default rendering. */
export const Default: Story = {};
