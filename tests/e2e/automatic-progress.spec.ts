import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('automatic progress is opt-in, logs only the next episode and shows a four-second fullscreen notice', async () => {
  test.setTimeout(45000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'automatic-progress-'));
  const extension = resolve('dist/chromium');
  const nativeChrome = !!process.env.MALMARK_CHROME_PATH;
  const context = await chromium.launchPersistentContext(profile, {
    channel: nativeChrome ? undefined : 'chromium',
    headless: true,
    executablePath: nativeChrome
      ? process.env.MALMARK_CHROME_PATH
      : process.env.MALMARK_BROWSER_PATH,
    ignoreDefaultArgs: nativeChrome ? ['--disable-extensions'] : undefined,
    args: nativeChrome
      ? ['--enable-unsafe-extension-debugging']
      : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    if (nativeChrome)
      await (
        await context.browser()!.newBrowserCDPSession()
      ).send('Extensions.loadUnpacked', { path: extension });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      const root = globalThis as any;
      root.testWrites = [];
      root.testAttempts = 0;
      root.anime = {
        id: 1,
        title: 'A Show',
        num_episodes: 12,
        status: 'currently_airing',
        my_list_status: { status: 'watching', num_episodes_watched: 1, score: 8 },
      };
      root.fetch = async (url: string, options: any = {}) => {
        if (options.method === 'PATCH') {
          root.testAttempts++;
          if (root.failNextWrite) {
            root.failNextWrite = false;
            return new Response('{}', { status: 503 });
          }
          root.testWrites.push(options.body);
          root.anime.my_list_status.num_episodes_watched = Number(
            new URLSearchParams(options.body).get('num_watched_episodes'),
          );
          return new Response(JSON.stringify(root.anime.my_list_status));
        }
        return new Response(
          JSON.stringify(url.includes('/anime?') ? { data: [{ node: root.anime }] } : root.anime),
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
    await context.route('https://www.crunchyroll.com/watch/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><title>Season 1 - Watch on Crunchyroll</title></head><body><a href="/series/SHOW/a-show">A Show</a><h1>Episode 2</h1><div id="player" style="background:#20232a;color:white"><video style="width:640px;height:360px"></video></div><button onclick="document.querySelector(\'#player\').requestFullscreen()">Fullscreen</button></body></html>',
      }),
    );
    const page = await context.newPage();
    await page.goto('https://www.crunchyroll.com/watch/EP2/episode');
    const tabId = await worker.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.tabs.query({
            url: 'https://www.crunchyroll.com/watch/*',
          })
        )[0].id,
    );
    const session = () =>
      worker.evaluate(
        async (tabId) =>
          (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`],
        tabId,
      );
    await expect.poll(async () => (await session())?.anime?.id).toBe(1);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html?tab=${tabId}`);
    await popup.getByRole('button', { name: 'Settings', exact: true }).click();
    const automatic = popup.locator('#auto-progress');
    await expect(automatic).not.toBeChecked();
    await automatic.check();
    await popup.locator('#show-prompts').uncheck();
    await popup.getByRole('button', { name: 'Save settings', exact: false }).click();
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await (globalThis as any).chrome.storage.local.get('settings')).settings.autoProgress,
        ),
      )
      .toBe(true);
    await popup.reload();
    await popup.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(automatic).toBeChecked();
    await page.bringToFront();
    await page.getByRole('button', { name: 'Fullscreen', exact: true }).click();
    await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id)).toBe('player');
    const report = async (watched: number) =>
      worker.evaluate(
        async ({ tabId, watched }) => {
          const api = (globalThis as any).chrome;
          const key = `tab:${tabId}`;
          const s = (await api.storage.session.get(key))[key];
          s.progress = { ranges: [[0, watched]], watched, duration: 1000, position: watched };
          await api.storage.session.set({ [key]: s });
          await api.scripting.executeScript({
            target: { tabId },
            args: [watched],
            func: (watched: number) => {
              const video = document.querySelector('video')!;
              Object.defineProperties(video, {
                duration: { value: 1000, configurable: true },
                currentTime: { value: watched, configurable: true },
                paused: { value: false, configurable: true },
              });
              video.dispatchEvent(new Event('pause'));
            },
          });
        },
        { tabId, watched },
      );
    await report(649);
    await expect.poll(async () => (await session())?.playerConnected).toBe(true);
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([]);
    await report(650);
    const notice = page.locator('#player > [data-malmark-notice]');
    await expect(notice).toBeVisible();
    const shownAt = Date.now();
    await expect(notice).toHaveAttribute('aria-label', 'MyAnimeList updated. Episode 2 saved.');
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      'num_watched_episodes=2',
    ]);
    expect((await session()).anime.my_list_status).toEqual({
      status: 'watching',
      num_episodes_watched: 2,
      score: 8,
    });
    await page.screenshot({ path: 'artifacts/screenshots/automatic-progress.png' });
    await expect(notice).toHaveCount(0, { timeout: 5000 });
    expect(Date.now() - shownAt).toBeGreaterThanOrEqual(3000);
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/EP4/episode');
      document.querySelector('h1')!.textContent = 'Episode 4';
    });
    await expect.poll(async () => (await session())?.episode).toBe(4);
    await report(900);
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await (globalThis as any).chrome.storage.local.get('pending')).pending?.[0]?.episode,
        ),
      )
      .toBe(4);
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      'num_watched_episodes=2',
    ]);
    // Exactly-next updates that fail fall back to the normal queue without a false success notice.
    await worker.evaluate(() => {
      (globalThis as any).failNextWrite = true;
    });
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/EP3/episode');
      document.querySelector('h1')!.textContent = 'Episode 3';
    });
    await expect.poll(async () => (await session())?.episode).toBe(3);
    await report(650);
    await expect
      .poll(() =>
        worker.evaluate(
          async () =>
            (await (globalThis as any).chrome.storage.local.get('pending')).pending?.find(
              (p: any) => p.episode === 3,
            )?.error,
        ),
      )
      .toContain('Automatic update failed');
    await expect(page.locator('[data-malmark-notice]')).toHaveCount(0);
    await report(700);
    expect(await worker.evaluate(() => (globalThis as any).testAttempts)).toBe(2);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe automatic progress profile');
    await rm(profile, { recursive: true, force: true });
  }
});
