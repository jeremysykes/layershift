/**
 * Navigation link URLs.
 *
 * In development each sub-app runs on its own dev server:
 *   - Storybook  → port 6006  (`npm run storybook`)
 *   - VitePress  → port 5174  (`npm run docs:dev`)
 *
 * In production (Vercel) both are built as static sub-directories
 * under the main site: /storybook/ and /docs/.
 */

export const STORYBOOK_URL = import.meta.env.DEV
  ? 'http://localhost:6006'
  : '/storybook/';

export const DOCS_URL = import.meta.env.DEV
  ? 'http://localhost:5174/docs/'
  : '/docs/';
