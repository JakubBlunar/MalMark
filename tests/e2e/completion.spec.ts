import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('completion and scoring require approval, fresh Finished Airing data, and a final episode', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'completion-profile-'));
  const extension = resolve('dist/chromium');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.MALMARK_BROWSER_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  context.setDefaultTimeout(10000);
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      const root = globalThis as any;
      root.testWrites = [];
      root.catalog = {
        1: {
          id: 1,
          title: 'A Show',
          num_episodes: 12,
          status: 'currently_airing',
          my_list_status: { status: 'watching', num_episodes_watched: 12, score: 7 },
        },
        2: {
          id: 2,
          title: 'Other Finished Show',
          num_episodes: 6,
          status: 'finished_airing',
          my_list_status: { status: 'watching', num_episodes_watched: 5, score: 8 },
        },
      };
      root.fetch = async (url: string, options: any = {}) => {
        const path = new URL(url).pathname;
        if (path.endsWith('/anime'))
          return new Response(JSON.stringify({ data: [{ node: root.catalog[1] }] }));
        const anime = root.catalog[Number(path.match(/\/anime\/(\d+)/)?.[1])];
        if (!anime) throw new Error(`Unexpected fixture request: ${path}`);
        if (options.method === 'PATCH') {
          root.testWrites.push({ animeId: anime.id, body: options.body });
          const form = new URLSearchParams(options.body);
          for (const key of ['status', 'score', 'num_watched_episodes', 'finish_date']) {
            if (!form.has(key)) continue;
            anime.my_list_status[key === 'num_watched_episodes' ? 'num_episodes_watched' : key] =
              key === 'status' || key === 'finish_date' ? form.get(key) : Number(form.get(key));
          }
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
    await context.route('https://www.crunchyroll.com/watch/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><title>Season 1 - Watch on Crunchyroll</title></head><body><a href="/series/SHOW/a-show">A Show</a><h1>Episode 12</h1></body></html>',
      }),
    );
    const page = await context.newPage();
    await page.goto('https://www.crunchyroll.com/watch/EP12/finale');
    const tabId = await worker.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.tabs.query({
            url: 'https://www.crunchyroll.com/watch/*',
          })
        )[0].id as number,
    );
    await expect
      .poll(() =>
        worker.evaluate(
          async (id) =>
            (await (globalThis as any).chrome.storage.session.get(`tab:${id}`))[`tab:${id}`]?.anime
              ?.id,
          tabId,
        ),
      )
      .toBe(1);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    await expect(popup.getByRole('button', { name: 'Complete & rate' })).toHaveCount(0);
    await worker.evaluate(() => {
      (globalThis as any).catalog[1].status = 'finished_airing';
    });
    await popup.getByRole('button', { name: 'Check again' }).click();
    await popup.getByRole('button', { name: 'Complete & rate' }).click();
    await expect(popup.getByLabel('Your score')).toHaveValue('');
    await popup.getByRole('button', { name: 'Cancel completion' }).click();
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([]);
    await popup.getByRole('button', { name: 'Complete & rate' }).click();
    await popup.getByLabel('Your score').selectOption('9');
    await worker.evaluate(() => {
      (globalThis as any).catalog[1].status = 'currently_airing';
    });
    await popup.getByRole('button', { name: 'Save completion' }).click();
    await expect(popup.getByRole('alert')).toContainText('Only anime marked Finished Airing');
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([]);
    await worker.evaluate(() => {
      (globalThis as any).catalog[1].status = 'finished_airing';
    });
    await popup.getByRole('button', { name: 'Check again' }).click();
    await popup.getByRole('button', { name: 'Complete & rate' }).click();
    await popup.getByLabel('Your score').selectOption('9');
    await popup.getByRole('button', { name: 'Save completion' }).click();
    await expect(popup.locator('.list-status b')).toHaveText('completed');
    await expect(popup.getByText('Your score: 9/10', { exact: true })).toBeVisible();
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      { animeId: 1, body: 'status=completed&num_watched_episodes=12&score=9' },
    ]);

    await popup.getByRole('button', { name: 'Settings', exact: true }).click();
    await popup.getByLabel('Set finish date automatically').check();
    await popup.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(popup.getByRole('status')).toContainText('Settings saved.');
    await popup.reload();
    await popup.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(popup.getByLabel('Set finish date automatically')).toBeChecked();
    await popup.getByRole('button', { name: 'Watching', exact: true }).click();
    const today = await popup.evaluate(() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    });

    // An autoplayed-away finale remains completable independently of the current anime.
    await worker.evaluate(async (tabId) => {
      const root = globalThis as any;
      await root.chrome.storage.local.set({
        pending: [
          {
            id: '5:2:6',
            anime: root.catalog[2],
            episode: 6,
            previous: 5,
            tabId,
            createdAt: Date.now(),
          },
        ],
      });
    }, tabId);
    const pending = popup.locator('.pending-card');
    await pending.getByRole('button', { name: 'Complete & rate' }).click();
    await expect(pending.getByLabel('Your score').locator('option:checked')).toHaveText(
      'Keep current score (8/10)',
    );
    await expect(pending.getByText(`Finish date will be set to today (${today}).`)).toBeVisible();
    await pending.getByRole('button', { name: 'Save completion' }).click();
    await expect(pending).toHaveCount(0);
    const result = await worker.evaluate(() => ({
      writes: (globalThis as any).testWrites,
      status: (globalThis as any).catalog[2].my_list_status,
    }));
    expect(result.writes[1]).toEqual({
      animeId: 2,
      body: `status=completed&num_watched_episodes=6&finish_date=${today}`,
    });
    expect(result.status).toEqual({
      status: 'completed',
      num_episodes_watched: 6,
      score: 8,
      finish_date: today,
    });
    await expect(popup.getByText('Your score: 9/10', { exact: true })).toBeVisible();
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
