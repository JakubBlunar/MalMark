import { chromium, test, expect } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('built Chromium extension detects a supported page and serves its popup', async () => {
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'browser-profile-'));
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
    const errors: string[] = [];
    const page = await context.newPage();
    await context.route('https://www.crunchyroll.com/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><head><title>Watch A Show - Crunchyroll</title></head><body><a href="/series/SHOW/a-show">A Show</a><h1>Episode 2</h1></body></html>',
      }),
    );
    await page.goto('https://www.crunchyroll.com/watch/a-show?ep=221');
    await expect
      .poll(async () =>
        worker.evaluate(async () => {
          const api = (globalThis as any).chrome;
          const data = await api.storage.session.get(null);
          return Object.values(data).some(
            (s: any) => s.detection?.title === 'A Show' && s.detection?.episode === 2,
          );
        }),
      )
      .toBe(true);
    const popup = await context.newPage();
    popup.on('pageerror', (e) => errors.push(e.message));
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByRole('heading', { name: /Keep watching/ })).toBeVisible();
    await expect(popup.getByRole('navigation')).toHaveCount(0);
    const { distribution } = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
    const setupVisible = distribution === 'unpacked';
    await expect(popup.getByLabel('MAL Client ID')).toHaveCount(setupVisible ? 1 : 0);
    if (setupVisible) {
      await expect(popup.getByLabel('Register this exact redirect URL')).toHaveValue(
        `https://${id}.chromiumapp.org/`,
      );
      await popup.getByLabel('MAL Client ID').fill('11111111111111111111111111111111');
      await popup.getByRole('button', { name: 'Save and continue' }).click();
      await expect(popup.getByRole('button', { name: 'Edit API setup' })).toBeVisible();
      await popup.reload();
    }
    await worker.evaluate(async () => {
      const root = globalThis as any;
      root.testWrites = [];
      root.chrome.identity.launchWebAuthFlow = (
        details: { url: string },
        callback?: (value: string) => void,
      ) => {
        root.testAuthUrl = details.url;
        const url = new URL(details.url);
        const redirect = new URL(url.searchParams.get('redirect_uri')!);
        redirect.searchParams.set('code', 'fixture-code');
        redirect.searchParams.set('state', url.searchParams.get('state')!);
        if (typeof callback === 'function') callback(redirect.href);
        else return Promise.resolve(redirect.href);
      };
      const anime = {
        id: 1,
        title: 'A Show',
        num_episodes: 12,
        my_list_status: { status: 'watching', num_episodes_watched: 1, score: 9 },
      };
      root.testAnime = anime;
      root.fetch = async (url: string, options: any = {}) => {
        if (url === 'https://myanimelist.net/v1/oauth2/token') {
          root.testTokenBody = options.body;
          return new Response(
            JSON.stringify({
              access_token: 'fixture',
              refresh_token: 'fixture-refresh',
              expires_in: 3600,
            }),
          );
        }
        if (url.includes('/users/@me'))
          return new Response(JSON.stringify({ id: 5, name: 'fixture-user' }));
        if (url.includes('/anime?'))
          return new Response(JSON.stringify({ data: [{ node: anime }] }));
        if (options.method === 'PATCH') {
          root.testWrites.push({ url, body: options.body });
          return new Response(JSON.stringify({ ...anime.my_list_status, num_episodes_watched: 2 }));
        }
        return new Response(JSON.stringify(anime));
      };
    });
    await popup.getByRole('button', { name: 'Connect MyAnimeList', exact: true }).click();
    await expect(popup.getByRole('navigation')).toBeVisible();
    const authorization = new URL(await worker.evaluate(() => (globalThis as any).testAuthUrl));
    expect(authorization.searchParams.get('client_id')).toMatch(/^[a-f0-9]{32}$/);
    if (setupVisible)
      expect(authorization.searchParams.get('client_id')).toBe('11111111111111111111111111111111');
    expect(authorization.searchParams.get('redirect_uri')).toBe(`https://${id}.chromiumapp.org/`);
    const token = new URLSearchParams(
      await worker.evaluate(() => (globalThis as any).testTokenBody),
    );
    expect(token.get('client_id')).toBe(authorization.searchParams.get('client_id'));
    expect(token.has('client_secret')).toBe(false);
    await popup.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(popup.getByText('Connected as fixture-user')).toBeVisible();
    await expect(popup.getByLabel('MAL Client ID')).toHaveCount(0);
    await popup.getByLabel('Completion threshold').fill('85');
    await popup.getByRole('button', { name: 'Save settings', exact: true }).click();
    await expect(popup.getByRole('status')).toContainText('Settings saved.');
    const saved = await worker.evaluate(
      async () => (await (globalThis as any).chrome.storage.local.get('settings')).settings,
    );
    expect(saved).toEqual({
      threshold: 85,
      minWatchSeconds: 60,
      showPrompts: true,
      promptAtEnd: true,
    });
    await worker.evaluate(async () => {
      const root = globalThis as any;
      await root.chrome.storage.local.set({
        pending: [
          {
            id: '5:1:2',
            anime: root.testAnime,
            episode: 2,
            previous: 1,
            createdAt: Date.now(),
            tabId: 1,
          },
        ],
      });
    });
    await popup.getByRole('button', { name: /^Watching/ }).click();
    await expect(popup.getByRole('button', { name: 'Update progress', exact: true })).toBeVisible();
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([]);
    await popup.screenshot({ path: 'artifacts/screenshots/confirm-update.png', fullPage: true });
    await popup.getByRole('button', { name: 'Update progress', exact: true }).click();
    await expect(popup.getByRole('status')).toContainText('Progress updated on MyAnimeList.');
    expect(await worker.evaluate(() => (globalThis as any).testWrites)).toEqual([
      {
        url: 'https://api.myanimelist.net/v2/anime/1/my_list_status',
        body: 'num_watched_episodes=2',
      },
    ]);
    expect(errors).toEqual([]);
    await popup.screenshot({ path: 'artifacts/screenshots/real-extension.png', fullPage: true });
    await popup.getByRole('button', { name: 'Open profile' }).click();
    await popup.getByRole('button', { name: 'Disconnect account', exact: true }).click();
    await expect(
      popup.getByRole('button', { name: 'Connect MyAnimeList', exact: true }),
    ).toBeEnabled();
    await expect(popup.getByRole('navigation')).toHaveCount(0);
    await expect(popup.getByLabel('MAL Client ID')).toHaveCount(0);
    if (setupVisible) {
      await popup.getByRole('button', { name: 'Edit API setup' }).click();
      await expect(popup.getByLabel('MAL Client ID')).toHaveValue(
        '11111111111111111111111111111111',
      );
      await expect(popup.getByLabel('Register this exact redirect URL')).toHaveValue(
        `https://${id}.chromiumapp.org/`,
      );
    }
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});

test('unpacked installations in different folders show their own OAuth callback', async () => {
  const { distribution } = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
  test.skip(distribution !== 'unpacked', 'Only unpacked builds have personal API setup.');
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const temporary = await mkdtemp(resolve(root, 'install-check-'));
  const callbacks: string[] = [];
  try {
    for (const name of ['installation-a', 'installation-b']) {
      const extension = resolve(temporary, name);
      await cp('dist/chromium', extension, { recursive: true });
      const context = await chromium.launchPersistentContext(
        resolve(temporary, name + '-profile'),
        {
          channel: 'chromium',
          headless: true,
          executablePath: process.env.MALMARK_BROWSER_PATH,
          args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
        },
      );
      try {
        const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
        const id = new URL(worker.url()).host;
        const page = await context.newPage();
        await page.goto(`chrome-extension://${id}/popup.html`);
        const expected = await worker.evaluate(() =>
          (globalThis as any).chrome.identity.getRedirectURL(),
        );
        await expect(page.getByLabel('Register this exact redirect URL')).toHaveValue(expected);
        expect(expected).toBe(`https://${id}.chromiumapp.org/`);
        callbacks.push(expected);
      } finally {
        await context.close();
      }
    }
    expect(callbacks[0]).not.toBe(callbacks[1]);
  } finally {
    if (!temporary.startsWith(root + sep)) throw new Error('Unsafe test installation path');
    await rm(temporary, { recursive: true, force: true });
  }
});

test('per-domain picker survives unrelated episode URLs', async () => {
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'browser-profile-'));
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
      root.fetch = async () => new Response(JSON.stringify({ data: [] }));
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
    // Use an already permitted origin to exercise the real picker without a native permission dialog.
    await context.route('https://myanimelist.net/malmark-fixture/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html><body style="margin:80px"><h2 id="anime-title">Cyberpunk: Edgerunners 2</h2><p>You are watching <b id="episode">Episode 8</b></p></body></html>',
      }),
    );
    const page = await context.newPage();
    await page.goto('https://myanimelist.net/malmark-fixture/very-strange-url');
    const tabId = await worker.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.tabs.query({
            url: 'https://myanimelist.net/malmark-fixture/*',
          })
        )[0].id,
    );
    const settings = await context.newPage();
    await settings.goto(`chrome-extension://${id}/options.html?tab=${tabId}&view=sites`);
    await settings.getByRole('button', { name: 'Choose elements on this page' }).click();
    await expect(page.getByRole('heading', { name: 'Pick the anime title.' })).toBeVisible();
    await page.locator('#anime-title').click();
    await expect(page.getByRole('heading', { name: 'Pick the episode number.' })).toBeVisible();
    await page.locator('#episode').click();
    await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
    await page.getByRole('button', { name: 'Save website', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'You’re all set.' })).toBeVisible();
    await expect
      .poll(
        async () =>
          worker.evaluate(
            async (tabId) =>
              (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`]
                ?.detection?.episode,
            tabId,
          ),
        { timeout: 10000 },
      )
      .toBe(8);
    await page.screenshot({ path: 'artifacts/screenshots/site-picker.png', fullPage: true });
    await page.goto('https://myanimelist.net/malmark-fixture/another-completely-different-url');
    await expect
      .poll(
        async () =>
          worker.evaluate(
            async (tabId) =>
              (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`]
                ?.detection?.title,
            tabId,
          ),
        { timeout: 10000 },
      )
      .toBe('Cyberpunk: Edgerunners 2');
    const site = await worker.evaluate(
      async () => (await (globalThis as any).chrome.storage.local.get('sites')).sites[0],
    );
    expect(site.titleSelector).toBe('#anime-title');
    expect(site.episodeSelector).toBe('#episode');
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
