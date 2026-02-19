/**
 * React entry point for the Layershift landing page.
 *
 * Registers Web Components via side-effect import, loads Tailwind/globals CSS,
 * and mounts the React app into #root.
 */

// Register Web Components (side-effect import — must come first)
import '../components/layershift/index';

// Global styles (Tailwind + theme + retained CSS)
import './globals.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// FOUC prevention — matches <head> inline style
document.body.classList.add('ready');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
