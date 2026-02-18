/**
 * Portfolio landing page entry point.
 *
 * Registers the <layershift-parallax> Web Component, loads the effects
 * manifest + video manifest, initialises a lightweight state store, and
 * wires up the effect selector, dynamic content rendering, hero scroll
 * interactions, section reveal, and framework tabs.
 */

import '../components/layershift/index';
import './styles.css';

import {
  createStore,
  type EffectsManifest,
  type VideoEntry,
  type Store,
} from './store';
import { getEffectContent, type EffectContent } from './effect-content';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRANSITION_MS = 300; // matches CSS .fade-out / .fade-in duration

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

async function loadEffectsManifest(): Promise<EffectsManifest> {
  try {
    const res = await fetch('/effects-manifest.json');
    return await res.json();
  } catch {
    // Fallback: single parallax effect
    return {
      defaultEffect: 'parallax',
      effects: [{ id: 'parallax', label: 'Depth Parallax', enabled: true }],
    };
  }
}

async function loadVideoManifest(): Promise<VideoEntry[]> {
  try {
    const res = await fetch('/videos/manifest.json');
    return await res.json();
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Video assignment
// ---------------------------------------------------------------------------

/** Fisher-Yates shuffle, returns a new array. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Set video source attributes on a layershift element. */
function applyVideo(el: HTMLElement, video: VideoEntry): void {
  el.setAttribute('src', video.src);
  el.setAttribute('depth-src', video.depthSrc);
  el.setAttribute('depth-meta', video.depthMeta);
}

/** Assign shuffled videos to hero + inline demo elements. */
function assignVideos(videos: VideoEntry[]): void {
  if (!videos.length) return;
  const shuffled = shuffle(videos);

  const heroEl = document.querySelector('#hero layershift-parallax');
  const demoEl = document.querySelector('#effect-content .inline-demo layershift-parallax');

  if (heroEl) applyVideo(heroEl as HTMLElement, shuffled[0]);
  if (demoEl) applyVideo(demoEl as HTMLElement, shuffled[1 % shuffled.length]);
}

// ---------------------------------------------------------------------------
// Effect selector
// ---------------------------------------------------------------------------

function renderEffectSelector(store: Store): void {
  const nav = document.getElementById('effect-selector');
  if (!nav) return;

  const { effects, activeEffect } = store.getState();
  const enabled = effects.filter((e) => e.enabled);

  // If only 1 enabled effect, don't render the selector
  if (enabled.length <= 1) {
    nav.innerHTML = '';
    return;
  }

  nav.className = 'effect-nav';
  nav.innerHTML = enabled
    .map(
      (e) =>
        `<button class="effect-nav-btn${e.id === activeEffect ? ' active' : ''}" data-effect="${e.id}">${e.label}</button>`
    )
    .join('');

  // Bind click handlers
  nav.querySelectorAll<HTMLButtonElement>('.effect-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const effectId = btn.dataset.effect;
      if (effectId && effectId !== store.getState().activeEffect) {
        store.setState({ activeEffect: effectId });
      }
    });
  });
}

/** Update active state on selector buttons without full re-render. */
function updateSelectorActiveState(store: Store): void {
  const nav = document.getElementById('effect-selector');
  if (!nav) return;

  const { activeEffect } = store.getState();
  nav.querySelectorAll<HTMLButtonElement>('.effect-nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.effect === activeEffect);
  });
}

// ---------------------------------------------------------------------------
// Effect content rendering
// ---------------------------------------------------------------------------

function renderEffectContent(content: EffectContent): void {
  const section = document.getElementById('effect-content');
  if (!section) return;
  const inner = section.querySelector('.section-inner');
  if (!inner) return;

  inner.innerHTML = `
    <h2>${content.title}</h2>
    <p>${content.description}</p>

    <!-- Inline demo -->
    <div class="inline-demo">
      <${content.tagName}
        ${Object.entries(content.demoAttrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join('\n        ')}
      ></${content.tagName}>
    </div>

    ${content.documentationHtml}
  `;
}

/** Update hero element attributes (or swap tag if different effect type). */
function updateHeroElement(content: EffectContent): void {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const existing = hero.querySelector(content.tagName);
  if (existing) {
    // Same tag — just update attributes
    for (const [key, val] of Object.entries(content.heroAttrs)) {
      existing.setAttribute(key, val);
    }
    return;
  }

  // Different tag — swap element
  hero.innerHTML = '';
  const el = document.createElement(content.tagName);
  for (const [key, val] of Object.entries(content.heroAttrs)) {
    el.setAttribute(key, val);
  }
  hero.appendChild(el);
}

/** Transition to a new effect with fade-out / swap / fade-in. */
async function transitionToEffect(
  content: EffectContent,
  videos: VideoEntry[],
  isInitial: boolean
): Promise<void> {
  const section = document.getElementById('effect-content');
  const inner = section?.querySelector('.section-inner') as HTMLElement | null;

  if (!inner) return;

  if (isInitial) {
    // First render — no transition, just populate
    renderEffectContent(content);
    updateHeroElement(content);
    assignVideos(videos);
    bindFrameworkTabs();
    return;
  }

  // Fade out
  inner.classList.add('fade-out');
  await wait(TRANSITION_MS);

  // Swap content
  renderEffectContent(content);
  updateHeroElement(content);
  assignVideos(videos);
  bindFrameworkTabs();

  // Fade in: briefly apply fade-in (starts invisible), then remove both classes
  inner.classList.remove('fade-out');
  inner.classList.add('fade-in');

  // Force reflow so the browser sees the fade-in state before we remove it
  void inner.offsetHeight;

  inner.classList.remove('fade-in');
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
// Framework tabs (re-bindable after content swap)
// ---------------------------------------------------------------------------

function bindFrameworkTabs(): void {
  const tabContainers = document.querySelectorAll('#effect-content .framework-tabs');

  tabContainers.forEach((container) => {
    const buttons = container.querySelectorAll<HTMLButtonElement>('.tab-btn');
    const panels = container.querySelectorAll<HTMLElement>('.tab-panel');

    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.tab;

        buttons.forEach((b) => b.classList.remove('active'));
        panels.forEach((p) => p.classList.remove('active'));

        btn.classList.add('active');
        const panel = container.querySelector<HTMLElement>(`.tab-panel[data-tab="${target}"]`);
        panel?.classList.add('active');
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

// Reveal the page now that CSS has loaded (prevents FOUC of unstyled HTML).
// The <head> has `body { visibility: hidden }` — this removes it.
document.body.classList.add('ready');

void (async () => {
  // Load both manifests in parallel
  const [effectsManifest, videos] = await Promise.all([
    loadEffectsManifest(),
    loadVideoManifest(),
  ]);

  // Determine the default effect
  const enabledEffects = effectsManifest.effects.filter((e) => e.enabled);
  const defaultId =
    enabledEffects.find((e) => e.id === effectsManifest.defaultEffect)?.id ??
    enabledEffects[0]?.id ??
    'parallax';

  // Create store
  const store = createStore({
    activeEffect: defaultId,
    effects: effectsManifest.effects,
    videos,
  });

  // Render effect selector (or nothing if single effect)
  renderEffectSelector(store);

  // Render initial effect content (no transition)
  const initialContent = getEffectContent(defaultId);
  if (initialContent) {
    await transitionToEffect(initialContent, videos, true);
  }

  // Subscribe to effect changes
  let isTransitioning = false;
  store.subscribe(async (state, prev) => {
    if (state.activeEffect === prev.activeEffect) return;
    if (isTransitioning) return;

    isTransitioning = true;
    updateSelectorActiveState(store);

    const content = getEffectContent(state.activeEffect);
    if (content) {
      await transitionToEffect(content, state.videos, false);
    }
    isTransitioning = false;
  });

  // Setup scroll interactions
  setupHeroScroll();
  setupSectionReveal();
})();
