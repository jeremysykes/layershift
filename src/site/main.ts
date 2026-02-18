/**
 * Portfolio landing page entry point.
 *
 * Registers the <layershift-parallax> Web Component and sets up scroll
 * interactions (hero fade, section reveal, framework tabs).
 * Randomly selects a demo video from the manifest on each page load.
 */

import '../components/layershift/index';
import './styles.css';

// ---------------------------------------------------------------------------
// Video manifest: random selection
// ---------------------------------------------------------------------------

interface VideoEntry {
  id: string;
  src: string;
  depthSrc: string;
  depthMeta: string;
}

function applyVideo(el: HTMLElement, video: VideoEntry): void {
  el.setAttribute('src', video.src);
  el.setAttribute('depth-src', video.depthSrc);
  el.setAttribute('depth-meta', video.depthMeta);
}

async function setupRandomVideo(): Promise<void> {
  try {
    const res = await fetch('/videos/manifest.json');
    const videos: VideoEntry[] = await res.json();
    if (!videos.length) return;

    const elements = document.querySelectorAll<HTMLElement>('layershift-parallax');
    if (!elements.length) return;

    // Shuffle the video list (Fisher-Yates)
    const shuffled = [...videos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Assign a different video to each element, cycling if more elements than videos
    elements.forEach((el, i) => {
      applyVideo(el, shuffled[i % shuffled.length]);
    });
  } catch (err) {
    console.warn('Failed to load video manifest, using defaults', err);
  }
}

// ---------------------------------------------------------------------------
// Scroll: hero fade + parallax on scroll
// ---------------------------------------------------------------------------

function setupHeroScroll(): void {
  const hero = document.getElementById('hero');
  const heroContent = document.getElementById('hero-scroll-hint');
  const wordmark = document.getElementById('hero-wordmark');
  if (!hero) return;

  // Show scroll hint and wordmark after a brief delay
  if (heroContent) {
    setTimeout(() => heroContent.classList.add('visible'), 3000);
  }
  if (wordmark) {
    setTimeout(() => wordmark.classList.add('visible'), 300);
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const scrollY = window.scrollY;
      const vh = window.innerHeight;
      const progress = Math.min(scrollY / vh, 1);

      // Fade hero to 0.15 opacity and scale down slightly
      const opacity = 1 - progress * 0.85;
      const scale = 1 - progress * 0.03;
      hero.style.opacity = String(opacity);
      hero.style.transform = `scale(${scale})`;

      // Fade wordmark and scroll hint with the hero
      if (wordmark) wordmark.style.opacity = String(Math.max(1 - progress * 2, 0));
      if (heroContent) heroContent.style.opacity = String(Math.max(1 - progress * 2, 0));

      ticking = false;
    });
  });
}

// ---------------------------------------------------------------------------
// Scroll: section fade-in on reveal
// ---------------------------------------------------------------------------

function setupSectionReveal(): void {
  const sections = document.querySelectorAll('.reveal');
  if (!sections.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
  );

  sections.forEach((section) => observer.observe(section));
}

// ---------------------------------------------------------------------------
// Framework tabs
// ---------------------------------------------------------------------------

function setupFrameworkTabs(): void {
  const tabContainer = document.querySelector('.framework-tabs');
  if (!tabContainer) return;

  const buttons = tabContainer.querySelectorAll<HTMLButtonElement>('.tab-btn');
  const panels = tabContainer.querySelectorAll<HTMLElement>('.tab-panel');

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      buttons.forEach((b) => b.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));

      btn.classList.add('active');
      const panel = tabContainer.querySelector<HTMLElement>(`.tab-panel[data-tab="${target}"]`);
      panel?.classList.add('active');
    });
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Reveal the page now that CSS has loaded (prevents FOUC of unstyled HTML).
// The <head> has `body { visibility: hidden }` — this removes it.
document.body.classList.add('ready');

setupRandomVideo();
setupHeroScroll();
setupSectionReveal();
setupFrameworkTabs();
