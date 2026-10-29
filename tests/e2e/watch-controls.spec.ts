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
    const inline = page
      .frames()
      .find((f) => f.url().startsWith(`chrome-extension://${id}/prompt.html#`))!;
    await expect(inline.getByRole('button', { name: 'Later', exact: true })).toBeVisible();
    const tabCount = context.pages().length;
    await inline.getByRole('button', { name: 'Later', exact: true }).click();
    await expect(prompt).toHaveCount(0);
    expect(context.pages()).toHaveLength(tabCount);
    expect(
      await worker.evaluate(
        async () =>
          (await (globalThis as any).chrome.storage.local.get('pending')).pending[0].deferred,
      ),
    ).toBe(true);
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

test('the in-page reminder updates MAL directly without opening a tab', async () => {
  test.setTimeout(45000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'inline-update-profile-'));
  const extension = resolve('dist/chromium');
  const nativeChrome = !!process.env.MALMARK_CHROME_PATH;
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
    if (nativeChrome)
      await (
        await context.browser()!.newBrowserCDPSession()
      ).send('Extensions.loadUnpacked', { path: extension });
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    const id = new URL(worker.url()).host;
    await worker.evaluate(async () => {
      const root = globalThis as any;
      root.testWrites = [];
      root.failInlineUpdate = true;
      const anime = {
        id: 1,
        title: 'A Show',
        my_list_status: { status: 'watching', num_episodes_watched: 1 },
      };
      root.fetch = async (url: string, options: any = {}) => {
        if (options.method === 'PATCH') {
          if (root.failInlineUpdate) {
            root.failInlineUpdate = false;
            return new Response('{}', { status: 503 });
          }
          await new Promise<void>((resolve) => {
            root.releaseInlineUpdate = resolve;
          });
          root.testWrites.push(options.body);
          anime.my_list_status.num_episodes_watched = Number(
            new URLSearchParams(options.body).get('num_watched_episodes'),
          );
          return new Response(JSON.stringify(anime.my_list_status));
        }
        return new Response(
          JSON.stringify(url.includes('/anime?') ? { data: [{ node: anime }] } : anime),
        );
      };
      await root.chrome.storage.local.set({
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture',
          clientId: 'fixture',
          expiresAt: Date.now() + 3600000,
          profile: { id: 5 },
        },
      });
    });
    await context.route('https://www.crunchyroll.com/watch/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body style="background:#222;color:white"><a href="/series/SHOW/a-show">A Show</a><h1>Episode 2</h1><video style="width:640px;height:360px"></video></body></html>',
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
    await expect
      .poll(() =>
        worker.evaluate(
          async (tabId) =>
            (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`]
              ?.anime?.id,
          tabId,
        ),
      )
      .toBe(1);
    await worker.evaluate(async (tabId) => {
      const api = (globalThis as any).chrome;
      const key = `tab:${tabId}`;
      const s = (await api.storage.session.get(key))[key];
      s.progress = { ranges: [[0, 800]], watched: 800, duration: 1000, position: 800 };
      await api.storage.session.set({ [key]: s });
      await api.scripting.executeScript({
        target: { tabId },
        func: () => {
          const video = document.querySelector('video')!;
          Object.defineProperties(video, {
            currentTime: { value: 800 },
            duration: { value: 1000 },
            paused: { value: true },
          });
          video.dispatchEvent(new Event('pause'));
        },
      });
    }, tabId);
    await expect(page.locator('[data-malmark-prompt]')).toBeVisible();
    await expect
      .poll(() =>
        page.frames().some((f) => f.url().startsWith(`chrome-extension://${id}/prompt.html#`)),
      )
      .toBe(true);
    const frame = page
      .frames()
      .find((f) => f.url().startsWith(`chrome-extension://${id}/prompt.html#`))!;
    const update = frame.getByRole('button', { name: 'Update progress', exact: true });
    await expect(update).toBeVisible();
    await expect(frame.getByText('Update MyAnimeList from 1 to 2 watched episodes?')).toBeVisible();
    const fitted = () =>
      frame.evaluate(() => ({
        viewport: innerHeight,
        content: document.querySelector('main')!.getBoundingClientRect().height,
        scroll: document.documentElement.scrollHeight,
      }));
    await expect
      .poll(async () => {
        const size = await fitted();
        return Math.abs(size.viewport - size.content);
      })
      .toBeLessThan(2);
    const compact = (await fitted()).viewport;
    await page.screenshot({ path: 'artifacts/screenshots/inline-reminder.png' });
    const tabCount = context.pages().length;
    await update.click();
    await expect(frame.getByRole('alert')).toContainText('503');
    await expect.poll(async () => (await fitted()).viewport).toBeGreaterThan(compact);
    await expect
      .poll(async () => {
        const size = await fitted();
        return Math.abs(size.viewport - size.content);
      })
      .toBeLessThan(2);
    // Width changes rewrap the real content; short viewports cap the iframe and retain scrolling.
    const originalViewport = page.viewportSize()!;
    await page.setViewportSize({ width: 320, height: 240 });
    await expect.poll(async () => (await fitted()).viewport).toBeLessThanOrEqual(192);
    await expect
      .poll(async () => {
        const size = await fitted();
        return size.scroll > size.viewport;
      })
      .toBe(true);
    await page.setViewportSize(originalViewport);
    await expect
      .poll(async () => {
        const size = await fitted();
        return Math.abs(size.viewport - size.content);
      })
      .toBeLessThan(2);
    // Retrying clears the error: verify shrinkage while the next API response is pending.
    await update.click();
    await expect.poll(async () => (await fitted()).viewport).toBe(compact);
    await expect
      .poll(() => worker.evaluate(() => typeof (globalThis as any).releaseInlineUpdate))
      .toBe('function');
    await worker.evaluate(() => (globalThis as any).releaseInlineUpdate());
    await expect(page.locator('[data-malmark-prompt]')).toHaveCount(0);
    expect(context.pages()).toHaveLength(tabCount);
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      'num_watched_episodes=2',
    ]);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe inline test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
