import { chromium, expect, test } from '@playwright/test';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash, generateKeyPairSync } from 'node:crypto';

test('Chromium package uses a native MV3 background and preserves login', async () => {
  const target = 'chromium';
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'browser-profile-'));
  const extension = resolve('dist', target);
  const manifest = JSON.parse(await readFile(resolve(extension, 'manifest.json'), 'utf8'));
  const streamingMatches = ['https://*.crunchyroll.com/*', 'https://crunchyroll.com/*'];
  expect(manifest.content_scripts[0].matches).toEqual(streamingMatches);
  expect(manifest.host_permissions).toEqual([
    ...streamingMatches,
    'https://api.myanimelist.net/*',
    'https://myanimelist.net/*',
  ]);
  expect(manifest.optional_host_permissions).toEqual(['https://*/*']);
  expect(manifest.manifest_version).toBe(3);
  expect(manifest.background).toEqual({ service_worker: 'background.js' });
  expect(manifest.side_panel).toEqual({ default_path: 'sidebar.html' });
  expect(manifest.permissions).toContain('sidePanel');
  expect(manifest.sidebar_action).toBeUndefined();
  const firefox = JSON.parse(await readFile(resolve('dist/firefox/manifest.json'), 'utf8'));
  expect(firefox.background).toEqual({ scripts: ['background.js'] });
  expect(firefox.sidebar_action.default_panel).toBe('sidebar.html');
  expect(firefox.sidebar_action.open_at_install).toBe(false);
  expect(firefox.permissions).not.toContain('sidePanel');
  expect(firefox.side_panel).toBeUndefined();
  const options = {
    channel: 'chromium',
    executablePath: process.env.MALMARK_BROWSER_PATH,
    headless: true,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  };
  let context = await chromium.launchPersistentContext(profile, options);
  try {
    const worker =
      context.serviceWorkers()[0] ||
      (await context.waitForEvent('serviceworker', { timeout: 5000 }));
    const id = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await expect(popup.getByRole('heading', { name: /Keep watching/ })).toBeVisible();
    const { distribution } = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
    if (distribution === 'unpacked') {
      await expect(popup.getByLabel('MAL Client ID')).toBeVisible();
      await expect(popup.getByLabel('Register this exact redirect URL')).toHaveValue(
        `https://${id}.chromiumapp.org/`,
      );
    } else {
      await expect(
        popup.getByRole('button', { name: 'Connect MyAnimeList', exact: true }),
      ).toBeEnabled();
      await expect(popup.getByLabel('MAL Client ID')).toHaveCount(0);
    }
    await expect(popup.getByText('Getting your watch session…')).toHaveCount(0);
    await popup.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.set({
        auth: {
          accessToken: 'fixture-access',
          refreshToken: 'fixture-refresh',
          expiresAt: Date.now() + 3600000,
          clientId: 'legacy-client',
          profile: { id: 5, name: 'fixture-user' },
        },
        settings: {
          clientId: 'lifecycle-test-client',
          threshold: 87,
          minWatchSeconds: 60,
          showPrompts: true,
        },
      });
    });
    await context.close();
    context = await chromium.launchPersistentContext(profile, options);
    const reopened = await context.newPage();
    await reopened.goto(`chrome-extension://${id}/popup.html`);
    await reopened.getByRole('button', { name: 'Settings', exact: true }).click();
    await expect(reopened.getByLabel('Completion threshold')).toHaveValue('87');
    await expect(reopened.getByLabel('MAL Client ID')).toHaveCount(0);
    await expect(reopened.getByText('Connected as fixture-user')).toBeVisible();
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});

test('a missing background displays recovery instead of spinning forever', async () => {
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const fixture = await mkdtemp(resolve(root, 'missing-background-'));
  const profile = await mkdtemp(resolve(root, 'browser-profile-'));
  await cp(resolve('dist/chromium'), fixture, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(fixture, 'manifest.json'), 'utf8'));
  delete manifest.background;
  const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const key = publicKey.export({ type: 'spki', format: 'der' });
  manifest.key = key.toString('base64');
  const id = [...createHash('sha256').update(key).digest('hex').slice(0, 32)]
    .map((c) => String.fromCharCode(97 + parseInt(c, 16)))
    .join('');
  await writeFile(resolve(fixture, 'manifest.json'), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    executablePath: process.env.MALMARK_BROWSER_PATH,
    args: [`--disable-extensions-except=${fixture}`, `--load-extension=${fixture}`],
  });
  try {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect(page.getByRole('heading', { name: 'Malmark couldn’t start.' })).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('background script');
    await expect(page.getByText('Getting your watch session…')).toHaveCount(0);
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Malmark couldn’t start.' })).toBeVisible();
  } finally {
    await context.close();
    for (const path of [profile, fixture]) {
      if (!path.startsWith(root + sep)) throw new Error('Unsafe test fixture path');
      await rm(path, { recursive: true, force: true });
    }
  }
});
