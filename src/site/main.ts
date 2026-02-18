/**
 * Portfolio landing page entry point.
 *
 * Registers the <layershift-parallax> Web Component and sets up scroll
 * interactions (hero fade, section reveal, framework tabs).
 */

import '../components/layershift/index';
import './styles.css';

// ---------------------------------------------------------------------------
// Scroll: hero fade + parallax on scroll
// ---------------------------------------------------------------------------

function setupHeroScroll(): void {
  const hero = document.getElementById('hero');
  const heroContent = document.getElementById('hero-scroll-hint');
  if (!hero) return;

  // Show scroll hint after 3s
  if (heroContent) {
    setTimeout(() => {
      heroContent.classList.add('visible');
    }, 3000);
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

      // Hide scroll hint on any scroll
      if (heroContent && progress > 0.05) {
        heroContent.classList.remove('visible');
      }

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

setupHeroScroll();
setupSectionReveal();
setupFrameworkTabs();
