import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

test('first-start language choice is visible without scrolling and Continue accepts automatic selection', async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 600 });
  await page.goto('/popup.html?distribution=store');
  const picker = page.locator('.welcome-language');
  await expect(picker).toBeInViewport();
  await expect(picker.getByRole('button', { name: 'Continue', exact: true })).toBeInViewport();
  await page.screenshot({ path: 'artifacts/screenshots/localization-welcome.png' });
  await picker.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(picker).toHaveCount(0);
  await expect(page.locator('.sign-in-actions').getByLabel('Language')).toHaveValue('auto');
  await page.reload();
  await expect(page.getByLabel('Language')).toHaveValue('auto');
  await expect(picker).toHaveCount(0);
});

test('detects device language before sign-in and loads only that catalog plus English', async ({
  browser,
}) => {
  const context = await browser.newContext({
    locale: 'sk-SK',
    viewport: { width: 320, height: 850 },
  });
  try {
    const page = await context.newPage();
    const loaded: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/locales/')) loaded.push(new URL(request.url()).pathname);
    });
    await page.goto('/sidebar.html?distribution=store');
    await expect(page.getByRole('heading', { name: /Pozeraj ďalej/ })).toBeVisible();
    await expect(page.getByLabel('Jazyk')).toHaveValue('auto');
    await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
    expect(loaded.sort()).toEqual(['/locales/en.json', '/locales/sk.json']);
    await page.getByLabel('Jazyk').selectOption('es');
    await expect(
      page.getByRole('button', { name: 'Conectar MyAnimeList', exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Idioma')).toHaveValue('es');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.reload();
    await expect(page.getByLabel('Idioma')).toHaveValue('es');
    await expect(page.getByRole('heading', { name: /Sigue viendo/ })).toBeVisible();
    await page.getByLabel('Idioma').selectOption('auto');
    await expect(page.getByLabel('Jazyk')).toHaveValue('auto');
    await expect(page.locator('html')).toHaveAttribute('lang', 'sk');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});

test('uses English for an unsupported device language and recovers a failed language download', async ({
  browser,
}) => {
  const context = await browser.newContext({ locale: 'ja-JP' });
  try {
    const page = await context.newPage();
    await page.goto('/popup.html?distribution=store');
    await expect(page.getByRole('heading', { name: /Keep watching/ })).toBeVisible();
    await page.route('**/locales/de.json', (route) => route.abort());
    await page.getByLabel('Language').selectOption('de');
    await expect(page.getByRole('alert')).toContainText('Could not change language');
    await expect(page.getByLabel('Language')).toHaveValue('auto');
    await page.unroute('**/locales/de.json');
    await page.getByLabel('Language').selectOption('de');
    await expect(page.getByLabel('Sprache')).toHaveValue('de');
    await expect(page.getByRole('heading', { name: /Schau weiter/ })).toBeVisible();
  } finally {
    await context.close();
  }
});

test('all languages fit the sidebar across watching, list, matching, sites and settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const locales = [
    ['es', 'Idioma'],
    ['cs', 'Jazyk'],
    ['sk', 'Jazyk'],
    ['de', 'Sprache'],
    ['fr', 'Langue'],
    ['pt-BR', 'Idioma'],
    ['id', 'Bahasa'],
    ['pl', 'Język'],
    ['en', 'Language'],
  ];
  for (const [code, label] of locales) {
    await page.goto('/sidebar.html?demo=watching&view=settings');
    await page.locator('.language-picker select').selectOption(code);
    await expect(page.getByLabel(label, { exact: true })).toHaveValue(code);
    for (const view of ['watching', 'list', 'matches', 'sites', 'settings', 'profile']) {
      await page.goto(`/sidebar.html?demo=watching&view=${view}`);
      await expect(page.locator('html')).toHaveAttribute('lang', code);
      await expect(page.locator('h1')).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${code}: ${view}`,
      ).toBe(true);
      for (const tab of await page.locator('.navigation > button').all()) {
        expect(
          await tab.evaluate((button) => {
            const label = button.querySelector('span')!;
            const a = button.getBoundingClientRect();
            const b = label.getBoundingClientRect();
            return b.left >= a.left && b.right <= a.right;
          }),
          `${code}: navigation label`,
        ).toBe(true);
      }
    }
  }
  expect(errors).toEqual([]);
  await page.goto('/sidebar.html?demo=watching&view=settings');
  await page.locator('.language-picker select').selectOption('sk');
  await expect(page.getByRole('heading', { name: 'Tvoje nastavenia.' })).toBeVisible();
  await page.screenshot({
    path: 'artifacts/screenshots/localization-settings-sk.png',
    fullPage: true,
  });
});

test('installed extension shares the preference across surfaces and preserves it after logout', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'localization-profile-'));
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
      const api = (globalThis as any).chrome;
      await api.storage.local.set({
        languagePreference: 'cs',
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture',
          expiresAt: Date.now() + 3600000,
          clientId: 'fixture',
          profile: { id: 5, name: 'fixture-user' },
        },
      });
    });
    const options = await context.newPage();
    const sidebar = await context.newPage();
    await options.goto(`chrome-extension://${id}/options.html?view=settings`);
    await sidebar.goto(`chrome-extension://${id}/sidebar.html?view=settings`);
    await expect(options.getByLabel('Jazyk')).toHaveValue('cs');
    await expect(sidebar.getByLabel('Jazyk')).toHaveValue('cs');
    await options.getByLabel('Jazyk').selectOption('pl');
    await expect(sidebar.getByLabel('Język')).toHaveValue('pl');
    await worker.evaluate(() => {
      (globalThis as any).fetch = async () => new Response(JSON.stringify({ data: [] }));
    });
    await context.route('https://www.crunchyroll.com/watch/**', (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<html lang="ja"><head><title>Watch A Show - Crunchyroll</title></head><body><a href="/series/SHOW/a-show">A Show</a><h1>Episode 2</h1></body></html>',
      }),
    );
    const watch = await context.newPage();
    await watch.goto('https://www.crunchyroll.com/watch/localization');
    await expect
      .poll(() => watch.frames().some((frame) => frame.url().includes('/prompt.html#')))
      .toBe(true);
    let prompt = watch.frames().find((frame) => frame.url().includes('/prompt.html#'))!;
    await expect(prompt.getByRole('heading', { name: 'Znajdź właściwe anime' })).toBeVisible();
    await options.getByLabel('Język').selectOption('sk');
    await expect
      .poll(() => watch.frames().some((frame) => frame.url().includes('/prompt.html#')))
      .toBe(true);
    // Language changes can replace the extension iframe, so resolve the live frame again.
    await expect
      .poll(async () => {
        prompt = watch.frames().find((frame) => frame.url().includes('/prompt.html#'))!;
        return prompt ? prompt.getByRole('heading', { name: 'Nájdi správne anime' }).count() : 0;
      })
      .toBe(1);
    await expect(watch.locator('html')).toHaveAttribute('lang', 'ja');
    await options.getByLabel('Jazyk').selectOption('pl');
    const tabId = await worker.evaluate(
      async () =>
        (
          await (globalThis as any).chrome.tabs.query({
            url: 'https://www.crunchyroll.com/watch/localization',
          })
        )[0].id,
    );
    await options.goto(`chrome-extension://${id}/options.html?view=sites&tab=${tabId}`);
    await options.getByRole('button', { name: 'Wybierz elementy na tej stronie' }).click();
    await expect(options.getByRole('status')).toContainText('Wybieranie elementów otwarte');
    await expect(watch.getByRole('heading', { name: 'Wybierz tytuł anime.' })).toBeVisible();
    await expect(watch.locator('html')).toHaveAttribute('lang', 'ja');
    await watch.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await options.goto(`chrome-extension://${id}/options.html?view=settings`);
    await options.getByRole('button', { name: 'Odłącz konto', exact: true }).click();
    await expect(options.getByRole('heading', { name: /Oglądaj dalej/ })).toBeVisible();
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByLabel('Język')).toHaveValue('pl');
    expect(
      await worker.evaluate(
        async () =>
          (await (globalThis as any).chrome.storage.local.get('languagePreference'))
            .languagePreference,
      ),
    ).toBe('pl');
  } finally {
    await context.close();
    const absolute = resolve(profile);
    if (!absolute.startsWith(root + sep)) throw new Error('Invalid browser profile directory');
    await rm(absolute, { recursive: true, force: true });
  }
});
