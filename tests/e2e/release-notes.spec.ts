import { chromium, expect, test } from '@playwright/test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import packageInfo from '../../package.json' with { type: 'json' };
import changelog from '../../src/shared/changelog.json' with { type: 'json' };

const { version } = packageInfo;
const previousRelease = changelog.releases[1];

test('updates highlight the version until notes are opened, across all extension surfaces', async () => {
  test.setTimeout(60000);
  const root = resolve('artifacts');
  await mkdir(root, { recursive: true });
  const profile = await mkdtemp(resolve(root, 'release-notes-profile-'));
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
    const readVersion = () =>
      worker.evaluate(
        async () =>
          (await (globalThis as any).chrome.storage.local.get('releaseNotesSeenVersion'))
            .releaseNotesSeenVersion,
      );
    await expect.poll(readVersion).toBe(version);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/popup.html`);
    await expect(page.locator('footer .has-update')).toHaveCount(0);
    // An existing installation of an older version has not yet read this release.
    await worker.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.set({
        releaseNotesSeenVersion: '0.0.1',
        auth: {
          accessToken: 'fixture',
          refreshToken: 'fixture',
          expiresAt: Date.now() + 3600000,
          clientId: 'fixture',
          profile: { id: 5, name: 'fixture-user' },
        },
      });
    });
    for (const surface of ['popup', 'sidebar', 'options']) {
      await worker.evaluate(async () => {
        await (globalThis as any).chrome.storage.local.set({ releaseNotesSeenVersion: '0.0.1' });
      });
      await page.setViewportSize({
        width: surface === 'options' ? 1100 : surface === 'sidebar' ? 320 : 420,
        height: 600,
      });
      await page.goto(`chrome-extension://${id}/${surface}.html?view=settings`);
      await expect(page.locator('footer .has-update')).toHaveCount(1);
      const notes = page.getByRole('region', { name: 'What’s new', exact: true });
      await expect(notes.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
      expect(await readVersion()).toBe('0.0.1');
      await page.getByRole('button', { name: /^Version .*What’s new$/ }).click();
      await expect(notes.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
      await expect(notes.getByText(`v${version} · Current version`)).toBeVisible();
      await expect(notes.getByText('Previous versions', { exact: true })).toBeVisible();
      await notes.locator('summary').first().click();
      await expect(
        notes.getByText(previousRelease.sections[0].items[0], { exact: true }),
      ).toBeVisible();
      await expect.poll(readVersion).toBe(version);
      await expect(page.locator('footer .has-update')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.reload();
      await expect(notes.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('footer .has-update')).toHaveCount(0);
      // Reading from Settings directly also clears the highlight.
      await worker.evaluate(async () => {
        await (globalThis as any).chrome.storage.local.set({ releaseNotesSeenVersion: '0.0.1' });
      });
      await expect(page.locator('footer .has-update')).toHaveCount(1);
      await notes.getByRole('button').click();
      await expect.poll(readVersion).toBe(version);
      await expect(page.locator('footer .has-update')).toHaveCount(0);
    }
    // Notes stay readable without a MAL account.
    await worker.evaluate(async () => {
      await (globalThis as any).chrome.storage.local.remove('auth');
    });
    await page.goto(`chrome-extension://${id}/popup.html`);
    await page.getByRole('button', { name: /^Version .*What’s new$/ }).click();
    await expect(
      page.getByRole('region', { name: 'What’s new', exact: true }).getByRole('button'),
    ).toHaveAttribute('aria-expanded', 'true');
  } finally {
    await context.close();
    if (!profile.startsWith(root + sep)) throw new Error('Unsafe browser profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
