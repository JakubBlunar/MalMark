import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

for (const target of ['chromium', 'chrome']) {
  test(`${target} opens its native sidebar and sidebar controls follow the active watch tab`, async () => {
    test.skip(
      target === 'chrome' && !process.env.MALMARK_CHROME_PATH,
      'Set MALMARK_CHROME_PATH to test the native Chrome sidebar.',
    );
    test.setTimeout(60000);
    const root = resolve('artifacts');
    await mkdir(root, { recursive: true });
    const profile = await mkdtemp(resolve(root, 'sidebar-profile-'));
    const extension = resolve('dist/chromium');
    const nativeChrome = target === 'chrome';
    const context = await chromium.launchPersistentContext(profile, {
      channel: nativeChrome ? undefined : 'chromium',
      executablePath: nativeChrome
        ? process.env.MALMARK_CHROME_PATH
        : process.env.MALMARK_BROWSER_PATH,
      headless: true,
      ignoreDefaultArgs: nativeChrome ? ['--disable-extensions'] : undefined,
      args: nativeChrome
        ? ['--enable-unsafe-extension-debugging']
        : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    });
    try {
      let id: string | undefined;
      if (nativeChrome) {
        const cdp = await context.browser()!.newBrowserCDPSession();
        ({ id } = await cdp.send('Extensions.loadUnpacked', { path: extension }));
      }
      const worker =
        context.serviceWorkers().find((w) => !id || new URL(w.url()).host === id) ||
        (await context.waitForEvent('serviceworker'));
      id ??= new URL(worker.url()).host;
      await worker.evaluate(async () => {
        const root = globalThis as any;
        root.testWrites = [];
        root.testAnime = {
          101: {
            id: 101,
            title: 'First Anime',
            num_episodes: 12,
            my_list_status: { status: 'watching', num_episodes_watched: 1 },
          },
          202: {
            id: 202,
            title: 'Second Anime',
            num_episodes: 24,
            my_list_status: { status: 'watching', num_episodes_watched: 5 },
          },
        };
        root.fetch = async (url: string, options: any = {}) => {
          const u = new URL(url);
          if (u.pathname.endsWith('/anime')) {
            const anime = u.searchParams.get('q')?.startsWith('First')
              ? root.testAnime[101]
              : root.testAnime[202];
            return new Response(JSON.stringify({ data: [{ node: anime }] }));
          }
          const anime = root.testAnime[Number(u.pathname.match(/\/anime\/(\d+)/)![1])];
          if (options.method === 'PATCH') {
            root.testWrites.push({ animeId: anime.id, body: options.body });
            anime.my_list_status.num_episodes_watched = Number(
              new URLSearchParams(options.body).get('num_watched_episodes'),
            );
            return new Response(JSON.stringify(anime.my_list_status));
          }
          return new Response(JSON.stringify(anime));
        };
        await root.chrome.storage.local.set({
          auth: {
            accessToken: 'fixture',
            refreshToken: 'fixture',
            expiresAt: Date.now() + 3600000,
            clientId: 'fixture',
            profile: { id: 5, name: 'fixture-user' },
          },
        });
      });
      await context.route('https://www.crunchyroll.com/**', (route) => {
        const first = route.request().url().includes('/FIRST/');
        return route.fulfill({
          contentType: 'text/html',
          body: `<html><body><a href="/series/${first ? 'FIRST' : 'SECOND'}/show">${first ? 'First' : 'Second'} Anime</a><h1>S1 E${first ? 2 : 6} - Episode</h1></body></html>`,
        });
      });
      const first = await context.newPage();
      await first.goto('https://www.crunchyroll.com/watch/FIRST/episode');
      const second = await context.newPage();
      await second.goto('https://www.crunchyroll.com/watch/SECOND/episode');
      const firstId = await worker.evaluate(
        async () =>
          (
            await (globalThis as any).chrome.tabs.query({
              url: 'https://www.crunchyroll.com/watch/FIRST/*',
            })
          )[0].id,
      );
      const options = await context.newPage();
      await options.goto(`chrome-extension://${id}/options.html?tab=${firstId}&view=watching`);
      await expect(
        options.getByRole('heading', { name: 'First Anime', exact: true }),
      ).toBeVisible();
      await options.getByRole('button', { name: 'Open sidebar', exact: true }).click();
      await expect.poll(() => options.getByRole('alert').count()).toBe(0);
      await expect
        .poll(() =>
          worker.evaluate(
            async () =>
              (
                await (globalThis as any).chrome.runtime.getContexts({
                  contextTypes: ['SIDE_PANEL'],
                })
              ).length,
          ),
        )
        .toBe(1);

      // Exercise the sidebar document at a measurable viewport as well as the native panel above.
      const sidebar = await context.newPage();
      await sidebar.setViewportSize({ width: 360, height: 850 });
      await sidebar.goto(`chrome-extension://${id}/sidebar.html?tab=${firstId}`);
      await first.bringToFront();
      await expect(
        sidebar.getByRole('heading', { name: 'First Anime', exact: true }),
      ).toBeVisible();
      await second.bringToFront();
      await expect(
        sidebar.getByRole('heading', { name: 'Second Anime', exact: true }),
      ).toBeVisible();
      await expect(sidebar.getByRole('heading', { name: 'First Anime', exact: true })).toHaveCount(
        0,
      );
      await expect(sidebar.getByLabel('Watched episodes on MAL')).toHaveValue('5');
      // Click without focusing the document's test tab (a native sidebar does not activate a browser tab).
      await sidebar
        .getByRole('button', { name: 'Increase watched episodes' })
        .evaluate((button: HTMLButtonElement) => button.click());
      await sidebar
        .getByRole('button', { name: 'Save to MAL' })
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(sidebar.getByText('6 of 24 episodes on MAL', { exact: true })).toBeVisible();
      expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
        { animeId: 202, body: 'num_watched_episodes=6' },
      ]);
      await sidebar
        .getByRole('button', { name: 'Matches', exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect(sidebar.getByLabel('Search MyAnimeList')).toHaveValue('Second Anime');
      await worker.evaluate(() => {
        const root = globalThis as any;
        const fetch = root.fetch;
        root.fetch = async (url: string, options: unknown) => {
          if (url.includes('/anime?')) {
            root.searchStarted = true;
            await new Promise((resolve) => {
              root.releaseSearch = resolve;
            });
          }
          return fetch(url, options);
        };
      });
      await sidebar
        .getByRole('button', { name: 'Search anime', exact: true })
        .evaluate((button: HTMLButtonElement) => button.click());
      await expect.poll(() => worker.evaluate(() => (globalThis as any).searchStarted)).toBe(true);
      await first.bringToFront();
      await expect(sidebar.getByLabel('Search MyAnimeList')).toHaveCount(0);
      await worker.evaluate(() => (globalThis as any).releaseSearch());
      await expect(sidebar.getByLabel('Search MyAnimeList')).toHaveValue('First Anime');
      await expect(sidebar.locator('.search-result')).toHaveCount(0);
      await worker.evaluate(async (tabId) => {
        await (globalThis as any).chrome.runtime.sendMessage({ type: 'REVIEW_UPDATES', tabId });
      }, firstId);
      await expect(
        sidebar.getByRole('heading', { name: 'First Anime', exact: true }),
      ).toBeVisible();
      await expect(sidebar.getByLabel('Watched episodes on MAL')).toHaveValue('1');
      const unrelated = await context.newPage();
      await unrelated.goto('about:blank');
      await unrelated.bringToFront();
      await expect(sidebar.getByRole('heading', { name: /Something good/ })).toBeVisible();
      await expect(sidebar.getByRole('button', { name: 'Save to MAL' })).toHaveCount(0);
    } finally {
      await context.close();
      if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
      await rm(profile, { recursive: true, force: true });
    }
  });
}
