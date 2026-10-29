import { chromium, expect, test, type BrowserContext, type Worker } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

async function fixtures(context: BrowserContext, worker: Worker, authenticate = false) {
  await context.route('https://www.crunchyroll.com/watch/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><title>Season 1 - Watch on Crunchyroll</title></head><body><a href="/series/SHOW/a-show">A Show</a><h1>Episode 2</h1><video style="width:640px;height:360px"></video></body></html>',
    }),
  );
  await worker.evaluate(async (authenticate) => {
    const root = globalThis as any;
    const anime = {
      id: 1,
      title: 'A Show',
      num_episodes: 12,
      my_list_status: { status: 'watching', num_episodes_watched: 1 },
    };
    root.fetch = async (url: string) =>
      new Response(JSON.stringify(url.includes('/anime?') ? { data: [{ node: anime }] } : anime));
    if (authenticate)
      await root.chrome.storage.local.set({
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture',
          expiresAt: Date.now() + 3600000,
          clientId: 'fixture',
          profile: { id: 5, name: 'fixture-user' },
        },
      });
  }, authenticate);
}
async function sample(worker: Worker, tabId: number, time: number) {
  await worker.evaluate(
    async ({ tabId, time }) => {
      const root = globalThis as any;
      if (root.testTime) root.testTime += 5000;
      await root.chrome.scripting.executeScript({
        target: { tabId },
        args: [time],
        func: (time: number) => {
          const video = document.querySelector('video')!;
          Object.defineProperties(video, {
            currentTime: { value: time, configurable: true },
            duration: { value: 1000, configurable: true },
            paused: { value: false, configurable: true },
          });
          video.dispatchEvent(new Event('pause'));
        },
      });
    },
    { tabId, time },
  );
}
const session = (worker: Worker, tabId: number) =>
  worker.evaluate(
    async (id) => (await (globalThis as any).chrome.storage.session.get(`tab:${id}`))[`tab:${id}`],
    tabId,
  );
const watchTab = (worker: Worker) =>
  worker.evaluate(
    async () =>
      (
        await (globalThis as any).chrome.tabs.query({ url: 'https://www.crunchyroll.com/watch/*' })
      )[0].id as number,
  );

test('watched ranges survive closing the browser and resume without counting a seek or offline time', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'resume-profile-'));
  const extension = resolve('dist/chromium');
  const options = {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.MALMARK_BROWSER_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    let worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    await fixtures(context, worker, true);
    await worker.evaluate(() => {
      const root = globalThis as any;
      root.testTime = Date.now() - 60000;
      Date.now = () => root.testTime;
    });
    let page = await context.newPage();
    await page.goto('https://www.crunchyroll.com/watch/EP2/episode');
    let tabId = await watchTab(worker);
    await expect.poll(async () => (await session(worker, tabId))?.anime?.id).toBe(1);
    for (const time of [0, 5, 10, 15, 20]) {
      await sample(worker, tabId, time);
      await expect.poll(async () => (await session(worker, tabId))?.progress?.watched).toBe(time);
    }
    expect(
      await worker.evaluate(
        async () =>
          (await (globalThis as any).chrome.storage.local.get('watchHistory')).watchHistory[0]
            .progress.watched,
      ),
    ).toBe(20);
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    await fixtures(context, worker);
    expect(
      await worker.evaluate(async () =>
        Object.values(await (globalThis as any).chrome.storage.session.get(null)).some(
          (value: any) => value.progress?.watched > 0,
        ),
      ),
    ).toBe(false);
    page = await context.newPage();
    await page.goto('https://www.crunchyroll.com/watch/EP2/episode?resume=true');
    tabId = await watchTab(worker);
    await expect.poll(async () => (await session(worker, tabId))?.progress?.watched).toBe(20);
    expect((await session(worker, tabId)).playerConnected).toBe(false);
    await sample(worker, tabId, 700);
    await expect.poll(async () => (await session(worker, tabId))?.progress?.position).toBe(700);
    expect((await session(worker, tabId)).progress.watched).toBe(20);
    await page.waitForTimeout(1200);
    await sample(worker, tabId, 701);
    await expect.poll(async () => (await session(worker, tabId))?.progress?.watched).toBe(21);
    await page.evaluate(() => {
      history.pushState({}, '', '/watch/EP3/next');
      document.querySelector('h1')!.textContent = 'Episode 3';
    });
    await expect.poll(async () => (await session(worker, tabId))?.episode).toBe(3);
    expect((await session(worker, tabId)).progress.watched).toBe(0);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});

test('a failed iframe injection retries and discovers delayed shadow players and replacements', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'player-recovery-profile-'));
  const extension = resolve('dist/chromium');
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.MALMARK_BROWSER_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
    await fixtures(context, worker, true);
    await context.route('https://myanimelist.net/malmark-player-fixture', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<div id="shell"></div>' }),
    );
    await worker.evaluate(() => {
      const root = globalThis as any;
      const execute = root.chrome.scripting.executeScript.bind(root.chrome.scripting);
      root.injectionAttempts = 0;
      root.chrome.scripting.executeScript = (details: any, ...rest: any[]) => {
        if (
          details.files?.includes('content.js') &&
          details.target.frameIds.some((id: number) => id !== 0)
        ) {
          root.injectionAttempts++;
          if (root.injectionAttempts === 1) throw new Error('Frame was not ready for injection');
        }
        return execute(details, ...rest);
      };
    });
    const page = await context.newPage();
    await page.goto('https://www.crunchyroll.com/watch/EP2/episode');
    const tabId = await watchTab(worker);
    await expect.poll(async () => (await session(worker, tabId))?.anime?.id).toBe(1);
    await page.evaluate(() => {
      const frame = document.createElement('iframe');
      frame.src = 'https://myanimelist.net/malmark-player-fixture';
      frame.style.cssText = 'width:700px;height:400px';
      document.body.append(frame);
    });
    await expect(page.frameLocator('iframe').locator('#shell')).toBeAttached();
    const frameId = await worker.evaluate(
      async (tabId) =>
        (await (globalThis as any).chrome.webNavigation.getAllFrames({ tabId })).find(
          (frame: any) => frame.url.includes('malmark-player-fixture'),
        ).frameId as number,
      tabId,
    );
    await worker.evaluate(
      async ({ tabId, frameId }) => {
        await (globalThis as any).chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          func: () => {
            const shadow = document.querySelector('#shell')!.attachShadow({ mode: 'open' });
            const child = document.createElement('section');
            shadow.append(child);
            const nested = child.attachShadow({ mode: 'open' });
            const video = document.createElement('video');
            video.style.cssText = 'width:640px;height:360px';
            Object.defineProperties(video, {
              duration: { value: 1000 },
              currentTime: { value: 10 },
              paused: { value: false },
            });
            nested.append(video);
          },
        });
      },
      { tabId, frameId },
    );
    await expect
      .poll(async () => (await session(worker, tabId))?.playerConnected, { timeout: 20000 })
      .toBe(true);
    expect(
      await worker.evaluate(() => (globalThis as any).injectionAttempts),
    ).toBeGreaterThanOrEqual(2);
    expect((await session(worker, tabId)).progress.position).toBe(10);
    await worker.evaluate(
      async ({ tabId, frameId }) => {
        await (globalThis as any).chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          func: () => {
            const root = document
              .querySelector('#shell')!
              .shadowRoot!.querySelector('section')!.shadowRoot!;
            root.querySelector('video')!.style.display = 'none';
            const replacement = document.createElement('video');
            replacement.style.cssText = 'width:640px;height:360px';
            Object.defineProperties(replacement, {
              duration: { value: 1000 },
              currentTime: { value: 25 },
              paused: { value: false },
            });
            root.append(replacement);
          },
        });
      },
      { tabId, frameId },
    );
    await expect.poll(async () => (await session(worker, tabId))?.progress?.position).toBe(25);
    expect((await session(worker, tabId)).progress.watched).toBe(0);
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
