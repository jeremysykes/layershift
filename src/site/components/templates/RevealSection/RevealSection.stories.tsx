import type { Meta, StoryObj } from '@storybook/react-vite';
import { RevealSection } from './RevealSection';

/**
 * Scroll-triggered reveal animation wrapper. Children fade in and slide
 * up when the section enters the viewport (10% visible, with a -40px
 * bottom margin). The `revealed` class is applied once and never removed.
 *
 * Accepts `children`, optional `className` for extra styling, and optional
 * `id` for anchor linking.
 */
const meta = {
  title: 'Templates/RevealSection',
  component: RevealSection,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
  },
} satisfies Meta<typeof RevealSection>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Basic reveal section with sample content. */
export const Default: Story = {
  args: {
    children: (
      <div className="max-w-[720px] mx-auto">
        <h2
          className="text-[1.75rem] font-semibold mb-4"
          style={{ color: '#fff' }}
        >
          Section Title
        </h2>
        <p style={{ color: '#999', lineHeight: 1.7 }}>
          This content fades in and slides up when the section scrolls into
          the viewport. The animation triggers once at 10% visibility with
          a -40px bottom margin offset.
        </p>
      </div>
    ),
  },
};

/** With a custom className for reduced vertical padding. */
export const CustomPadding: Story = {
  args: {
    className: '!py-10',
    children: (
      <div className="max-w-[720px] mx-auto">
        <h2
          className="text-[1.75rem] font-semibold mb-4"
          style={{ color: '#fff' }}
        >
          Compact Section
        </h2>
        <p style={{ color: '#999', lineHeight: 1.7 }}>
          This section uses reduced vertical padding via the className prop.
        </p>
      </div>
    ),
  },
};

/** With an anchor id for deep linking. */
export const WithAnchorId: Story = {
  args: {
    id: 'my-section',
    children: (
      <div className="max-w-[720px] mx-auto">
        <h2
          className="text-[1.75rem] font-semibold mb-4"
          style={{ color: '#fff' }}
        >
          Anchored Section
        </h2>
        <p style={{ color: '#999', lineHeight: 1.7 }}>
          This section has <code style={{ color: '#ccc' }}>id="my-section"</code>{' '}
          for anchor linking. In production, you can scroll to it via{' '}
          <code style={{ color: '#ccc' }}>#my-section</code>.
        </p>
      </div>
    ),
  },
};

/** Multiple sections stacked to demonstrate scroll-triggered reveal. */
export const ScrollDemo: Story = {
  args: {
    children: null,
  },
  parameters: {
    layout: 'fullscreen',
  },
  render: () => (
    <div>
      <div style={{ height: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#555' }}>Scroll down to trigger reveal animations</p>
      </div>
      {[1, 2, 3].map((n) => (
        <RevealSection key={n}>
          <div className="max-w-[720px] mx-auto">
            <h2
              className="text-[1.75rem] font-semibold mb-4"
              style={{ color: '#fff' }}
            >
              Section {n}
            </h2>
            <p style={{ color: '#999', lineHeight: 1.7 }}>
              Content for section {n}. Each section reveals independently
              as it scrolls into view.
            </p>
          </div>
        </RevealSection>
      ))}
    </div>
  ),
};
