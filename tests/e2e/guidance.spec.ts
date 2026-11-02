import { chromium, expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('on-page help offers shorter search results and immediate player access', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'guidance-profile-'));
  const extension = resolve('dist/chromium');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.MALMARK_BROWSER_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const space = 'Reborn as a Space Mercenary: I Woke Up Piloting the Strongest Starship!';
  const magic =
    'Magic Repo Man: Dumped by My Party, I’ll Cash In With a Cute Support Fairy to Become the Strongest!';
  const missing = 'Completely Unknown Anime: No Matching Results';
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    await worker.evaluate(
      async ({ space }) => {
        const root = globalThis as any;
        root.queries = [];
        root.catalog = {
          1: {
            id: 1,
            title: 'Magic Repo Man',
            media_type: 'tv',
            my_list_status: { status: 'watching', num_episodes_watched: 0 },
          },
          2: { id: 2, title: 'Magic Repo Man Season 2', media_type: 'tv' },
          3: {
            id: 3,
            title: 'Space Mercenary',
            alternative_titles: { en: space },
            media_type: 'tv',
            my_list_status: { status: 'watching', num_episodes_watched: 0 },
          },
        };
        root.fetch = async (value: string, options: any = {}) => {
          if (options.method) throw new Error('This test must not write to MAL.');
          const url = new URL(value);
          if (url.pathname.endsWith('/anime')) {
            const query = url.searchParams.get('q');
            root.queries.push(query);
            const ids =
              query === 'Magic Repo Man'
                ? [1, 2]
                : query === 'Reborn as a Space Mercenary'
                  ? [3]
                  : [];
            return new Response(
              JSON.stringify({ data: ids.map((id) => ({ node: root.catalog[id] })) }),
            );
          }
          const anime = root.catalog[Number(url.pathname.match(/\/anime\/(\d+)/)?.[1])];
          return new Response(JSON.stringify(anime));
        };
        await root.chrome.storage.local.set({
          auth: {
            accessToken: 'fixture',
            refreshToken: 'fixture',
            expiresAt: Date.now() + 3600000,
            clientId: 'fixture',
            profile: { id: 5, name: 'viewer' },
          },
          settings: { showPrompts: true },
        });
      },
      { space },
    );
    await context.route('https://player.example/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<html><body>Player fixture</body></html>' }),
    );
    await context.route('https://www.crunchyroll.com/watch/**', (route) => {
      const player = route.request().url().includes('/player');
      const absent = route.request().url().includes('/missing');
      const title = player ? space : absent ? missing : magic;
      const series = player ? 'SPACE' : absent ? 'MISSING' : 'MAGIC';
      return route.fulfill({
        contentType: 'text/html',
        body: `<html><head><meta charset="utf-8"></head><body><a href="/series/${series}/show">${title}</a><h1>Episode 1</h1>${player ? '<iframe src="https://player.example/video" width="640" height="360"></iframe>' : ''}</body></html>`,
      });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    async function promptFrame(page: Page, heading: string) {
      await expect
        .poll(() => page.frames().filter((frame) => frame.url().includes('/prompt.html#')).length)
        .toBe(1);
      const frame = page.frames().find((frame) => frame.url().includes('/prompt.html#'))!;
      await expect(frame.getByRole('heading', { name: heading, exact: true })).toBeVisible();
      return frame;
    }
    await page.goto('https://www.crunchyroll.com/watch/magic');
    const match = await promptFrame(page, 'Find the right anime');
    const opened = context.waitForEvent('page');
    await match.getByRole('button', { name: 'Find match', exact: true }).click();
    const search = await opened;
    await expect(search.getByLabel('Search MyAnimeList')).toHaveValue('Magic Repo Man');
    await expect(search.locator('.search-result')).toHaveCount(2);
    await search.screenshot({
      path: 'artifacts/screenshots/shorter-match-search.png',
      fullPage: true,
    });
    await search.getByLabel('Search MyAnimeList').fill('My own search');
    // Allow a state refresh before checking that it preserves an edited query.
    await search.waitForTimeout(2200);
    await expect(search.getByLabel('Search MyAnimeList')).toHaveValue('My own search');
    expect(await worker.evaluate(() => (globalThis as any).queries.length)).toBe(2);
    await search.close();
    await page.goto('https://www.crunchyroll.com/watch/player');
    const player = await promptFrame(page, 'Connect the video player');
    await expect(player.getByText('player.example', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'artifacts/screenshots/player-access-prompt.png' });
    // Exercise the actual trusted button click with a denied native request.
    await player.evaluate(() => {
      const root = globalThis as any;
      root.chrome.permissions.request = (permissions: any, callback?: (value: boolean) => void) => {
        root.requestedOrigins = permissions.origins;
        if (typeof callback === 'function') callback(false);
        else return Promise.resolve(false);
      };
    });
    await player.getByRole('button', { name: 'Allow', exact: true }).click();
    await expect(player.getByRole('alert')).toContainText('Player access was not granted');
    expect(await player.evaluate(() => (globalThis as any).requestedOrigins)).toEqual([
      'https://player.example/*',
    ]);
    await player.getByRole('button', { name: 'Later', exact: true }).click();
    // Assert the visible UI and saved dismissal, not asynchronous browser-frame cleanup.
    await expect(page.locator('[data-malmark-prompt]')).toHaveCount(0);
    await expect
      .poll(() =>
        worker.evaluate(async () => {
          const entries = await (globalThis as any).chrome.storage.session.get(null);
          return Object.entries(entries).some(
            ([key, value]) =>
              key.startsWith('guidanceDismissed:') &&
              Array.isArray(value) &&
              value.includes('player:https://player.example'),
          );
        }),
      )
      .toBe(true);
    await page.goto('https://www.crunchyroll.com/watch/missing');
    const empty = await promptFrame(page, 'Find the right anime');
    const emptyPage = context.waitForEvent('page');
    await empty.getByRole('button', { name: 'Find match', exact: true }).click();
    const emptySearch = await emptyPage;
    await expect(emptySearch.getByLabel('Search MyAnimeList')).toHaveValue(missing);
    await expect(
      emptySearch.getByText('No results. Try the Japanese title or include the season number.'),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
