/**
 * E2E tests for the portfolio landing page.
 *
 * Validates that the page loads, the Web Component initializes,
 * custom events fire, and interactive elements work.
 *
 * Note: The layershift component loads ~19MB video + ~28MB depth data,
 * so generous timeouts are used. Headless Chromium supports WebGL.
 */

import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/layershift/i);
  });

  test('hero section exists with layershift component', async ({ page }) => {
    const hero = page.locator('#hero');
    await expect(hero).toBeVisible();

    const component = hero.locator('layershift-parallax');
    await expect(component).toBeAttached();
  });

  test('layershift component creates a shadow root with canvas', async ({ page }) => {
    test.setTimeout(60_000); // Component loads ~47MB of assets

    // Wait for the component to initialize (loads video + depth data)
    const component = page.locator('layershift-parallax').first();
    await expect(component).toBeAttached();

    // Wait for shadow DOM canvas to appear (component needs time to load assets)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('layershift-parallax');
        return !!el?.shadowRoot?.querySelector('canvas');
      },
      { timeout: 45_000 }
    );

    const hasCanvas = await component.evaluate((el) => {
      return el.shadowRoot?.querySelector('canvas') !== null;
    });
    expect(hasCanvas).toBe(true);
  });

  test('layershift-parallax:ready event fires on initialization', async ({ page }) => {
    const readyDetail = await page.evaluate(() => {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Ready event not received within 30s'));
        }, 30_000);

        // Listen on all layershift elements
        document.addEventListener('layershift-parallax:ready', ((e: CustomEvent) => {
          clearTimeout(timeout);
          resolve(e.detail as Record<string, unknown>);
        }) as EventListener);
      });
    });

    expect(readyDetail).toHaveProperty('videoWidth');
    expect(readyDetail).toHaveProperty('videoHeight');
    expect(readyDetail).toHaveProperty('duration');
    expect(typeof readyDetail.videoWidth).toBe('number');
    expect(typeof readyDetail.videoHeight).toBe('number');
    expect(typeof readyDetail.duration).toBe('number');
    expect(readyDetail.videoWidth).toBeGreaterThan(0);
    expect(readyDetail.videoHeight).toBeGreaterThan(0);
  });

  test('scroll hint appears after delay', async ({ page }) => {
    const scrollHint = page.locator('#hero-scroll-hint');
    await expect(scrollHint).toBeAttached();

    // Scroll hint gets .visible class after 3 seconds
    await page.waitForFunction(
      () => {
        const el = document.getElementById('hero-scroll-hint');
        return el?.classList.contains('visible');
      },
      { timeout: 5_000 }
    );
  });

  test('content sections exist below the hero', async ({ page }) => {
    await page.evaluate(() => window.scrollTo(0, window.innerHeight));
    await page.waitForTimeout(500);

    const sections = page.locator('.content section');
    const count = await sections.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('framework tabs are interactive', async ({ page }) => {
    const tabsSection = page.locator('.framework-tabs');
    if ((await tabsSection.count()) > 0) {
      await tabsSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);

      const tabs = page.locator('.tab-btn');
      const tabCount = await tabs.count();

      if (tabCount > 1) {
        // Click the React tab
        await tabs.nth(1).click();
        await page.waitForTimeout(200);

        const isActive = await tabs.nth(1).evaluate((el) =>
          el.classList.contains('active')
        );
        expect(isActive).toBe(true);
      }
    }
  });

  test('configuration and events tables are present', async ({ page }) => {
    const tables = page.locator('.config-table');
    const tableCount = await tables.count();
    expect(tableCount).toBeGreaterThanOrEqual(2); // attributes table + events table

    // Attributes table (first)
    const attrTable = tables.first();
    await attrTable.scrollIntoViewIfNeeded();
    await expect(attrTable).toBeVisible();
    const attrRows = attrTable.locator('tbody tr');
    expect(await attrRows.count()).toBeGreaterThanOrEqual(7);

    // Events table (second)
    const eventsTable = tables.nth(1);
    await eventsTable.scrollIntoViewIfNeeded();
    await expect(eventsTable).toBeVisible();
    const eventRows = eventsTable.locator('tbody tr');
    expect(await eventRows.count()).toBeGreaterThanOrEqual(6); // 6 events
  });
});

test.describe('WebGL rendering', () => {
  test('canvas has non-zero dimensions after init', async ({ page }) => {
    await page.goto('/');

    // Wait for the component to fully initialize
    await page.waitForFunction(
      () => {
        const el = document.querySelector('layershift-parallax');
        const canvas = el?.shadowRoot?.querySelector('canvas');
        return canvas && canvas.width > 0 && canvas.height > 0;
      },
      { timeout: 30_000 }
    );

    const dimensions = await page.evaluate(() => {
      const el = document.querySelector('layershift-parallax');
      const canvas = el?.shadowRoot?.querySelector('canvas');
      if (!canvas) return null;
      return { width: canvas.width, height: canvas.height };
    });

    expect(dimensions).not.toBeNull();
    expect(dimensions!.width).toBeGreaterThan(0);
    expect(dimensions!.height).toBeGreaterThan(0);
  });
});

test.describe('Events', () => {
  test('layershift-parallax:play event fires when video plays', async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');

    // Wait for the ready event (ensures component is fully initialized)
    await page.waitForFunction(
      () => {
        const el = document.querySelector('layershift-parallax');
        return !!el?.shadowRoot?.querySelector('canvas');
      },
      { timeout: 45_000 }
    );

    // Small delay to ensure video event listeners are attached
    await page.waitForTimeout(500);

    // Trigger pause → play and listen for the play event
    const playDetail = await page.evaluate(() => {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Play event not received within 10s'));
        }, 10_000);

        document.addEventListener('layershift-parallax:play', ((e: CustomEvent) => {
          clearTimeout(timeout);
          resolve(e.detail as Record<string, unknown>);
        }) as EventListener, { once: true });

        const el = document.querySelector('layershift-parallax');
        const video = el?.shadowRoot?.querySelector('video');
        if (video) {
          video.pause();
          setTimeout(() => { void video.play(); }, 200);
        } else {
          clearTimeout(timeout);
          reject(new Error('No video element found'));
        }
      });
    });

    expect(playDetail).toHaveProperty('currentTime');
    expect(typeof playDetail.currentTime).toBe('number');
  });

  test('layershift-parallax:pause event fires when video pauses', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => {
        const el = document.querySelector('layershift-parallax');
        return !!el?.shadowRoot?.querySelector('canvas');
      },
      { timeout: 30_000 }
    );

    const pauseDetail = await page.evaluate(() => {
      return new Promise<Record<string, unknown>>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Pause event not received within 5s'));
        }, 5_000);

        document.addEventListener('layershift-parallax:pause', ((e: CustomEvent) => {
          clearTimeout(timeout);
          resolve(e.detail as Record<string, unknown>);
        }) as EventListener, { once: true });

        const el = document.querySelector('layershift-parallax');
        const video = el?.shadowRoot?.querySelector('video');
        if (video) {
          video.pause();
        } else {
          clearTimeout(timeout);
          reject(new Error('No video element found'));
        }
      });
    });

    expect(pauseDetail).toHaveProperty('currentTime');
    expect(typeof pauseDetail.currentTime).toBe('number');
  });
});
