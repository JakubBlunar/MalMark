import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('skipped sections, fullscreen, autoplay, manual counts and matching work together', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'watch-controls-profile-'));
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
      root.testWrites = [];
      root.testAnime = {
        id: 1,
        title: 'A Show',
        num_episodes: 26,
        media_type: 'tv',
        my_list_status: { status: 'watching', num_episodes_watched: 15, score: 9 },
      };
      root.fetch = async (url: string, options: any = {}) => {
        if (options.method === 'PATCH') {
          root.testWrites.push(options.body);
          root.testAnime.my_list_status.num_episodes_watched = Number(
            new URLSearchParams(options.body).get('num_watched_episodes'),
          );
          return new Response(JSON.stringify(root.testAnime.my_list_status));
        }
        if (url.includes('/anime?'))
          return new Response(
            JSON.stringify({
              data: Array.from({ length: 12 }, (_, i) => ({
                node: {
                  ...root.testAnime,
                  id: i + 1,
                  title: i ? `A Show Season ${i + 1}` : 'A Show',
                },
              })),
            }),
          );
        return new Response(JSON.stringify(root.testAnime));
      };
      await root.chrome.storage.local.set({
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture',
          expiresAt: Date.now() + 3600000,
          clientId: 'fixture',
          profile: { id: 5, name: 'fixture-user' },
        },
        settings: { threshold: 80, minWatchSeconds: 60, showPrompts: true, promptAtEnd: true },
      });
    });
    await context.route('https://www.crunchyroll.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: `
      <html><head><title>Season 1 Episode - Watch on Crunchyroll</title></head><body>
      <a href="/series/SHOW/a-show">A Show</a><h1>E16 - Episode</h1>
      <div id="player"><video style="width:640px;height:360px"></video></div>
      <button id="fullscreen" onclick="document.querySelector('#player').requestFullscreen()">Fullscreen</button>
      <button id="native-fullscreen" onclick="document.querySelector('video').requestFullscreen()">Video fullscreen</button>
      </body></html>`,
      }),
    );
    const page = await context.newPage();
    await page.goto('https://www.crunchyroll.com/watch/EP16/episode');
    const tabId = await worker.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.tabs.query({
            url: 'https://www.crunchyroll.com/watch/*',
          })
        )[0].id,
    );
    const getSession = () =>
      worker.evaluate(
        async (tabId) =>
          (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`],
        tabId,
      );
    await expect.poll(async () => (await getSession())?.anime?.id).toBe(1);

    // Seed previously watched ranges; real content-script events still drive completion and the reminder.
    await worker.evaluate(async (tabId) => {
      const api = (globalThis as any).chrome;
      const key = `tab:${tabId}`;
      const s = (await api.storage.session.get(key))[key];
      s.progress = { ranges: [[0, 999]], watched: 999, duration: 1420, position: 1300 };
      await api.storage.session.set({ [key]: s });
    }, tabId);
    await worker.evaluate(async (tabId) => {
      await (globalThis as any).chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const video = document.querySelector('video')!;
          Object.defineProperties(video, {
            duration: { value: 1420 },
            currentTime: { value: 1370 },
            paused: { value: false },
          });
          video.dispatchEvent(new Event('pause'));
        },
      });
    }, tabId);
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await (globalThis as any).chrome.storage.local.get('pending')).pending?.[0]?.episode,
        ),
      )
      .toBe(16);
    const prompt = page.locator('[data-malmark-prompt]');
    await expect(prompt).toBeVisible();
    await page.locator('#fullscreen').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
    await expect(page.locator('#player > [data-malmark-prompt]')).toBeVisible();
    await page.evaluate(() => document.exitFullscreen());
    await expect(page.locator('html > [data-malmark-prompt]')).toBeVisible();
    await page.locator('#native-fullscreen').click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.tagName)).toBe('VIDEO');
    await expect(prompt).toBeHidden();
    await page.evaluate(() => document.exitFullscreen());
    await expect(prompt).toBeVisible();

    await context.route('https://static.crunchyroll.com/malmark-player', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<div id="frame-player" style="width:640px;height:360px;background:#171522"><button onclick="document.querySelector(\'#frame-player\').requestFullscreen()">Frame fullscreen</button></div>',
      }),
    );
    await page.evaluate(() => {
      const iframe = document.createElement('iframe');
      iframe.id = 'embedded-player';
      iframe.src = 'https://static.crunchyroll.com/malmark-player';
      iframe.allowFullscreen = true;
      iframe.style.cssText = 'width:700px;height:400px';
      document.body.append(iframe);
    });
    const frame = page.frameLocator('#embedded-player');
    await frame.getByRole('button', { name: 'Frame fullscreen' }).click();
    await expect
      .poll(() => page.evaluate(() => document.fullscreenElement?.id))
      .toBe('embedded-player');
    await expect(frame.locator('#frame-player > [data-malmark-prompt]')).toBeVisible();
    await expect(prompt).toBeHidden();
    await page.evaluate(() => document.exitFullscreen());
    await expect(prompt).toBeVisible();
    await expect(frame.locator('[data-malmark-prompt]')).toHaveCount(0);

    // Simulate Crunchyroll's SPA autoplay before the user approves episode 16.
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/EP17/next');
      document.querySelector('h1')!.textContent = 'E17 - Next episode';
    });
    await expect.poll(async () => (await getSession())?.episode).toBe(17);
    expect((await getSession()).progress.watched).toBe(0);
    await expect(prompt).toBeVisible();
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([]);
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 420, height: 600 });
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    await expect(
      popup.getByRole('heading', { name: 'Another episode, in the books.' }),
    ).toBeVisible();
    await popup.getByRole('button', { name: 'Update progress', exact: true }).click();
    await expect(popup.getByLabel('Watched episodes on MAL')).toHaveValue('16');
    await popup.getByRole('button', { name: 'Increase watched episodes' }).click();
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      'num_watched_episodes=16',
    ]);
    await popup.getByRole('button', { name: 'Save to MAL' }).click();
    await expect(popup.getByText('17 of 26 episodes on MAL', { exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Decrease watched episodes' }).click();
    await expect(popup.getByText('Reduces your watched total from 17 to 16.')).toBeVisible();
    await popup.getByRole('button', { name: 'Save to MAL' }).click();
    await expect(popup.getByText('16 of 26 episodes on MAL', { exact: true })).toBeVisible();
    await popup.getByLabel('Watched episodes on MAL').fill('14');
    await popup.getByRole('button', { name: 'Save to MAL' }).click();
    await expect(popup.getByText('14 of 26 episodes on MAL', { exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Use episode 17' }).click();
    await expect(popup.getByLabel('Watched episodes on MAL')).toHaveValue('17');
    await popup.screenshot({ path: 'artifacts/screenshots/manual-progress.png', fullPage: true });

    await popup.getByRole('button', { name: 'Matches', exact: true }).click();
    await popup.getByRole('button', { name: 'Search anime', exact: true }).click();
    await expect(popup.locator('.search-result')).toHaveCount(12);
    const workspaceTop = (await popup.locator('.match-workspace').boundingBox())!.y;
    await popup.locator('.search-result').first().click();
    await expect(popup.getByLabel('Search MyAnimeList')).toHaveCount(0);
    await expect(popup.locator('.search-results')).toHaveCount(0);
    const save = popup.getByRole('button', { name: 'Save match', exact: true });
    await expect(save).toBeVisible();
    const saveBox = (await save.boundingBox())!;
    expect(saveBox.y).toBeGreaterThan(workspaceTop);
    expect(saveBox.y + saveBox.height).toBeLessThan(600);
    await popup.screenshot({ path: 'artifacts/screenshots/matching-save.png' });
    await popup.getByRole('button', { name: 'Back to results' }).click();
    await expect(popup.locator('.search-result')).toHaveCount(12);
    await popup.locator('.search-result').first().click();
    await save.click();
    await expect(popup.getByRole('status')).toContainText('Match saved');
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      'num_watched_episodes=16',
      'num_watched_episodes=17',
      'num_watched_episodes=16',
      'num_watched_episodes=14',
    ]);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
