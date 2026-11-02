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
      autoProgress: false,
      autoFinishDate: false,
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
  test.setTimeout(60000);
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
        body: '<html><body style="margin:80px"><h2 id="anime-title">Cyberpunk: Edgerunners 2</h2><div id="servers-content"><div class="ps_-status"><div class="server-notice"><strong>You are watching <b>Episode 8</b></strong></div></div></div><span id="edited-episode">Episode 11</span></body></html>',
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
    await settings.goto(`chrome-extension://${id}/popup.html?tab=${tabId}&view=sites`);
    await settings.getByRole('button', { name: 'Choose elements on this page' }).click();
    await expect(page.getByRole('heading', { name: 'Pick the anime title.' })).toBeVisible();
    await expect.poll(() => settings.isClosed()).toBe(true);
    await page.locator('#anime-title').click();
    await expect(page.getByRole('heading', { name: 'Pick the episode number.' })).toBeVisible();
    await page.locator('.server-notice b').click();
    await expect(page.getByRole('heading', { name: 'Does this look right?' })).toBeVisible();
    await page.getByLabel('Episode selector', { exact: true }).fill('???');
    await expect(page.getByRole('button', { name: 'Save website', exact: true })).toBeDisabled();
    await expect(
      page.getByText('Episode selector is not valid CSS.', { exact: true }),
    ).toBeVisible();
    await page.getByLabel('Episode selector', { exact: true }).fill('.missing-episode');
    await expect(
      page.getByText('Episode selector matches no elements on this page.', { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel('Episode selector', { exact: true })
      .fill('#servers-content .server-notice b');
    await expect(page.getByText('1 match: Episode 8', { exact: true })).toBeVisible();
    await page.screenshot({ path: 'artifacts/screenshots/edit-picker-selectors.png' });
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
    await page.evaluate(() => {
      const other = document.createElement('b');
      other.textContent = 'Episode 99';
      document.body.prepend(other);
      document.querySelector('.server-notice b')!.textContent = 'Episode 9';
    });
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
    expect(site.episodeSelector).toContain('.server-notice');
    await expect
      .poll(async () =>
        worker.evaluate(
          async (tabId) =>
            (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`]
              ?.detection?.episode,
          tabId,
        ),
      )
      .toBe(9);

    // A saved edit must update every open watch page on this domain.
    const second = await context.newPage();
    await second.goto('https://myanimelist.net/malmark-fixture/selector-second');
    const secondId = await worker.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.tabs.query({
            url: 'https://myanimelist.net/malmark-fixture/selector-second',
          })
        )[0].id,
    );
    await expect
      .poll(async () =>
        worker.evaluate(
          async (tabId) =>
            (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`]
              ?.detection?.episode,
          secondId,
        ),
      )
      .toBe(8);
    const editor = await context.newPage();
    await editor.goto(`chrome-extension://${id}/options.html?tab=${tabId}&view=sites`);
    const saved = editor.getByRole('region', { name: 'Website myanimelist.net', exact: true });
    await saved.getByText('Edit selectors', { exact: true }).click();
    await saved.getByLabel('Episode selector', { exact: true }).fill('???');
    await saved.getByRole('button', { name: 'Save selectors', exact: true }).click();
    await expect(saved.getByRole('alert')).toHaveText('Episode selector is not valid CSS.');
    await saved.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(saved.getByLabel('Episode selector', { exact: true })).toHaveValue(
      site.episodeSelector,
    );
    await saved.getByLabel('Episode selector', { exact: true }).fill('.missing-episode');
    await saved.getByRole('button', { name: 'Test on this page', exact: true }).click();
    await expect(saved.getByRole('status')).toContainText('matches no elements');
    await saved.getByLabel('Episode selector', { exact: true }).fill('#edited-episode');
    await saved.getByRole('button', { name: 'Test on this page', exact: true }).click();
    await expect(saved.getByRole('status')).toContainText('1 match: Episode 11');
    await saved.getByRole('button', { name: 'Save selectors', exact: true }).click();
    for (const targetId of [tabId, secondId])
      await expect
        .poll(async () =>
          worker.evaluate(
            async (tabId) =>
              (await (globalThis as any).chrome.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`]
                ?.detection?.episode,
            targetId,
          ),
        )
        .toBe(11);
    await editor.setViewportSize({ width: 320, height: 850 });
    expect(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await saved.screenshot({ path: 'artifacts/screenshots/edit-saved-selectors.png' });
    for (const surface of ['popup', 'sidebar']) {
      const ui = await context.newPage();
      await ui.setViewportSize({ width: surface === 'popup' ? 420 : 320, height: 850 });
      await ui.goto(`chrome-extension://${id}/${surface}.html?tab=${tabId}&view=sites`);
      if (surface === 'sidebar') await page.bringToFront();
      const card = ui.getByRole('region', { name: 'Website myanimelist.net', exact: true });
      await card
        .getByText('Edit selectors', { exact: true })
        .evaluate((element: HTMLElement) => element.click());
      await expect(card.getByLabel('Anime title selector', { exact: true })).toBeEditable();
      await expect(card.getByLabel('Episode selector', { exact: true })).toHaveValue(
        '#edited-episode',
      );
      expect(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await ui.close();
    }
    // Technical users can also skip picking and enter both selectors directly.
    await editor.getByRole('button', { name: 'Choose elements on this page', exact: true }).click();
    await page.getByRole('button', { name: 'Enter selectors manually', exact: true }).click();
    await page.getByLabel('Anime title selector', { exact: true }).fill('#anime-title');
    await page.getByLabel('Episode selector', { exact: true }).fill('#edited-episode');
    await page.getByRole('button', { name: 'Save website', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'You’re all set.' })).toBeVisible();
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
