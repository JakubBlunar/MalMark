import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('installed Chrome loads the clean manifest and matches Re:ZERO season four', async () => {
  test.skip(
    !process.env.MALMARK_CHROME_PATH,
    'Set MALMARK_CHROME_PATH to test installed Google Chrome.',
  );
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'chrome-profile-'));
  const context = await chromium.launchPersistentContext(profile, {
    executablePath: process.env.MALMARK_CHROME_PATH,
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    // CDP extension installation is supported in branded Chrome without --load-extension.
    args: ['--enable-unsafe-extension-debugging'],
    viewport: { width: 420, height: 850 },
  });
  try {
    const cdp = await context.browser()!.newBrowserCDPSession();
    const { id } = await test.step('Install into the isolated Chrome profile', () =>
      cdp.send('Extensions.loadUnpacked', { path: resolve('dist/chromium') }));
    const worker =
      context.serviceWorkers().find((w) => new URL(w.url()).host === id) ||
      (await context.waitForEvent('serviceworker', { timeout: 5000 }));
    const manifest = await worker.evaluate(() => (globalThis as any).chrome.runtime.getManifest());
    expect(manifest.background).toEqual({ service_worker: 'background.js' });
    await worker.evaluate(async () => {
      const root = globalThis as any;
      const title = 'Re:ZERO -Starting Life in Another World-';
      const anime = {
        id: 61316,
        title: 'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season',
        alternative_titles: { en: title + ' Season 4' },
        media_type: 'tv',
        num_episodes: 19,
        my_list_status: { status: 'watching', num_episodes_watched: 18 },
      };
      const candidates = [
        {
          id: 31240,
          title: 'Re:Zero kara Hajimeru Isekai Seikatsu',
          media_type: 'tv',
          alternative_titles: { en: title },
        },
        {
          id: 38389,
          title: 'He Wei Dao x Re:ZERO',
          media_type: 'cm',
          alternative_titles: { synonyms: [title] },
        },
        anime,
      ];
      root.testSearchQueries = [];
      root.fetch = async (value: string) => {
        const url = new URL(value);
        if (url.pathname.endsWith('/anime')) {
          root.testSearchQueries.push(url.searchParams.get('q'));
          return new Response(JSON.stringify({ data: candidates.map((node) => ({ node })) }));
        }
        return new Response(JSON.stringify(anime));
      };
      await root.chrome.storage.local.set({
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture-refresh',
          expiresAt: Date.now() + 3600000,
          clientId: 'fixture-client',
          profile: { id: 5, name: 'fixture-user' },
        },
      });
    });
    const url = 'https://www.crunchyroll.com/watch/GE00345558JAJP/from-now-on';
    await context.route(url, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><title>Season 4 From Now On - Watch on Crunchyroll</title><meta property="og:title" content="Re:ZERO -Starting Life in Another World-"></head><body><a href="/series/REZERO/show">Re:ZERO -Starting Life in Another World-</a><h1>E19 - From Now On</h1></body></html>',
      }),
    );
    const watch = await context.newPage();
    await watch.goto(url);
    await expect
      .poll(
        async () =>
          worker.evaluate(async () =>
            Object.values(await (globalThis as any).chrome.storage.session.get(null)).some(
              (s: any) => s.anime?.id === 61316 && s.detection?.season === 4,
            ),
          ),
        { timeout: 10000 },
      )
      .toBe(true);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(
      popup.getByRole('heading', { name: 'Re:ZERO -Starting Life in Another World- Season 4' }),
    ).toBeVisible();
    await expect(popup.getByText('Matched on MyAnimeList', { exact: true })).toBeVisible();
    expect(await worker.evaluate(() => (globalThis as any).testSearchQueries)).toContain(
      'Re:ZERO -Starting Life in Another World- Season 4',
    );
    await popup.screenshot({
      path: 'artifacts/screenshots/chrome-rezero-matched.png',
      fullPage: true,
    });
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
