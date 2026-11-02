import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('My list loads, paginates, refreshes, retries, and expands from the sidebar', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'my-list-profile-'));
  const extension = resolve('dist/chromium');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.MALMARK_BROWSER_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      const root = globalThis as any;
      root.listLoads = [];
      root.listFailure = false;
      root.emptyList = false;
      root.fetch = async (value: string, options: any = {}) => {
        if (options.method) throw new Error('The watching overview must not write to MAL.');
        const url = new URL(value);
        if (url.pathname !== '/v2/users/@me/animelist')
          throw new Error(`Unexpected request: ${url.pathname}`);
        const offset = Number(url.searchParams.get('offset'));
        root.listLoads.push(offset);
        if (root.listFailure) return new Response('{}', { status: 503 });
        const entry = (id: number, title: string, watched: number, total: number) => ({
          node: { id, title, num_episodes: total },
          list_status: { status: 'watching', num_episodes_watched: watched },
        });
        return new Response(
          JSON.stringify(
            root.emptyList
              ? { data: [], paging: {} }
              : offset === 0
                ? {
                    data: [
                      entry(
                        101,
                        'An Anime With a Very Long Title That Still Fits a Narrow Sidebar',
                        4,
                        12,
                      ),
                      {
                        ...entry(202, 'Kaijuu 8-gou: Narumi no Heijitsu', 120, 0),
                        node: {
                          id: 202,
                          title: 'Kaijuu 8-gou: Narumi no Heijitsu',
                          num_episodes: 0,
                          alternative_titles: { en: "Kaiju No. 8: Narumi's Week at Work" },
                        },
                      },
                    ],
                    paging: { next: 'https://api.myanimelist.net/v2/users/@me/animelist?offset=2' },
                  }
                : {
                    data: [
                      entry(
                        101,
                        'An Anime With a Very Long Title That Still Fits a Narrow Sidebar',
                        5,
                        12,
                      ),
                      entry(303, 'A Finished Season', 12, 12),
                    ],
                    paging: {},
                  },
          ),
        );
      };
      await root.chrome.storage.local.set({
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture',
          clientId: 'fixture',
          expiresAt: Date.now() + 3600000,
          profile: { id: 5, name: 'fixture-user' },
        },
      });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`chrome-extension://${id}/options.html?view=list`);
    await expect(
      page.getByRole('heading', { name: 'Currently watching', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.my-list-item')).toHaveCount(2);
    await expect(page.locator('.my-list-item').first()).toContainText('4 / 12 episodes');
    await expect(page.locator('.my-list-item').last()).toContainText('120 / ? episodes');
    await expect(page.locator('.my-list-item').last().locator('h3')).toHaveText(
      "Kaiju No. 8: Narumi's Week at Work",
    );
    await expect(page.locator('.my-list-item').last().locator('.my-list-original')).toHaveText(
      'Kaijuu 8-gou: Narumi no Heijitsu',
    );
    await expect(page.getByRole('link', { name: 'Full list on MAL', exact: true })).toHaveAttribute(
      'href',
      'https://myanimelist.net/animelist/fixture-user',
    );
    await page.waitForTimeout(2200);
    expect(await worker.evaluate(() => (globalThis as any).listLoads)).toEqual([0]);
    await worker.evaluate(() => {
      (globalThis as any).listFailure = true;
    });
    await page.getByRole('button', { name: 'Load more', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('MyAnimeList returned an error');
    await expect(page.locator('.my-list-item')).toHaveCount(2);
    await worker.evaluate(() => {
      (globalThis as any).listFailure = false;
    });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.locator('.my-list-item')).toHaveCount(3);
    await expect(page.locator('.my-list-item').first()).toContainText('5 / 12 episodes');
    await expect(page.locator('.my-list-item').last()).toContainText('All episodes logged');
    await expect(page.getByRole('button', { name: 'Load more', exact: true })).toHaveCount(0);
    await worker.evaluate(() => {
      (globalThis as any).listFailure = true;
    });
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('MyAnimeList returned an error');
    await expect(page.locator('.my-list-item')).toHaveCount(3);
    await worker.evaluate(() => {
      const root = globalThis as any;
      root.listFailure = false;
      root.emptyList = true;
    });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'A new story is waiting.', exact: true }),
    ).toBeVisible();
    await expect(page.locator('.my-list-item')).toHaveCount(0);
    await worker.evaluate(() => {
      (globalThis as any).emptyList = false;
    });
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(page.getByLabel('Completion threshold')).toBeVisible();
    await page.getByRole('button', { name: 'My list', exact: true }).click();
    await expect(page.locator('.my-list-item')).toHaveCount(2);
    const sidebar = await context.newPage();
    await sidebar.setViewportSize({ width: 320, height: 850 });
    await sidebar.goto(`chrome-extension://${id}/sidebar.html?view=list`);
    await expect(sidebar.locator('.my-list-item')).toHaveCount(2);
    expect(await sidebar.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const expanded = context.waitForEvent('page');
    await sidebar.getByRole('button', { name: 'Expand Malmark', exact: true }).click();
    const full = await expanded;
    await expect(full).toHaveURL(/options\.html\?view=list/);
    await expect(
      full.getByRole('heading', { name: 'Currently watching', exact: true }),
    ).toBeVisible();
    await expect(full.locator('.my-list-item')).toHaveCount(2);
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 420, height: 850 });
    await popup.goto(`chrome-extension://${id}/popup.html?view=list`);
    await expect(popup.locator('.my-list-item')).toHaveCount(2);
    expect(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
