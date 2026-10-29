import { test, expect } from '@playwright/test';
test('signed-out users see a direct sign-in without API setup or settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 420, height: 850 });
  await page.goto('/popup.html?distribution=store');
  await expect(page.getByRole('heading', { name: /Keep watching/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect MyAnimeList', exact: true }),
  ).toBeEnabled();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await expect(page.getByLabel('MAL Client ID')).toHaveCount(0);
  await expect(page.getByText('Create a MAL API app')).toHaveCount(0);
  await expect(page.getByText('Aniwatch', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect MyAnimeList', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Browser preview');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/screenshots/login.png', fullPage: true });
});

test('options pages also start with sign-in and settings only contain preferences', async ({
  page,
}) => {
  await page.goto('/options.html?view=settings&distribution=store');
  await expect(
    page.getByRole('button', { name: 'Connect MyAnimeList', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/options.html?demo=watching&view=settings');
  await expect(page.getByLabel('Completion threshold')).toBeVisible();
  await expect(page.getByLabel('MAL Client ID')).toHaveCount(0);
  await expect(page.getByText('Register this exact redirect URL')).toHaveCount(0);
});

test('GitHub builds explain API setup and keep the callback readable in narrow sidebars', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/sidebar.html');
  await expect(page.getByRole('link', { name: 'Create a MAL API app' })).toHaveAttribute(
    'href',
    'https://myanimelist.net/apiconfig',
  );
  await expect(page.getByLabel('Register this exact redirect URL')).toHaveValue(
    'https://your-extension-id.chromiumapp.org/',
  );
  await expect(page.getByRole('button', { name: 'Connect MyAnimeList', exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Save and continue' })).toBeDisabled();
  await page.getByLabel('MAL Client ID').fill('fixture-client');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(page.getByRole('status')).toContainText('Browser preview');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/screenshots/api-setup-sidebar.png', fullPage: true });
});
test('watching view explains progress and match source', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 850 });
  await page.goto('/popup.html?demo=watching');
  await expect(page.getByRole('heading', { name: 'Frieren: Beyond Journey’s End' })).toBeVisible();
  await expect(page.getByText('Matched on MyAnimeList', { exact: true })).toBeVisible();
  await expect(page.getByText('70%', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Correct episode' }).click();
  await expect(page.getByLabel('MAL episode number for this page')).toHaveValue('7');
  await page.screenshot({ path: 'artifacts/screenshots/watching.png', fullPage: true });
});
test('pending updates remain explicit and preview cannot mutate data', async ({ page }) => {
  await page.goto('/popup.html?demo=pending');
  await expect(page.getByRole('button', { name: 'Update progress', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Update progress', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Browser preview');
  await expect(page.getByRole('button', { name: 'Update progress', exact: true })).toBeVisible();
});

test('finished series offer optional scoring after all episodes are logged and in finale reminders', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 850 });
  await page.goto('/sidebar.html?demo=watching');
  await expect(page.getByRole('button', { name: 'Complete & rate' })).toHaveCount(0);
  await page.goto('/sidebar.html?demo=finished');
  await page.getByRole('button', { name: 'Complete & rate' }).click();
  await expect(page.getByLabel('Your score')).toHaveValue('');
  await expect(page.getByLabel('Your score').locator('option:checked')).toHaveText(
    'Keep current score (8/10)',
  );
  await page.getByLabel('Your score').selectOption('9');
  await page.getByRole('button', { name: 'Save completion' }).click();
  await expect(page.getByRole('status')).toContainText('Browser preview');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: 'artifacts/screenshots/complete-series-sidebar.png',
    fullPage: true,
  });
  await page.goto('/popup.html?demo=finale');
  await expect(
    page.locator('.pending-card').getByRole('button', { name: 'Complete & rate' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Update progress', exact: true })).toBeVisible();
});
test('manual matching and profile screens render without overflow', async ({ page }) => {
  await page.goto('/options.html?demo=unmatched&view=matches');
  await expect(page.getByRole('heading', { name: 'Make the connection.' })).toBeVisible();
  await expect(page.getByLabel('Search MyAnimeList')).toHaveValue('Frieren: Beyond Journey’s End');
  await page.getByRole('button', { name: 'Open profile' }).click();
  await expect(page.getByRole('heading', { name: 'animefan' })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/screenshots/profile-mobile.png', fullPage: true });
});

test('Crunchyroll is the sole built-in integration and other domains use the picker', async ({
  page,
}) => {
  await page.goto('/popup.html?demo=watching');
  await page.getByRole('button', { name: 'Sites', exact: true }).click();
  await expect(page.locator('.builtin-sites > div')).toHaveCount(1);
  await expect(page.locator('.builtin-sites')).toContainText('Crunchyroll');
  await expect(page.getByText('Aniwatch', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Netflix', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choose elements on this page' })).toBeVisible();
});

test('sidebar adapts to narrow and wide panels with all screens available', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/sidebar.html?distribution=store');
  await expect(page.getByRole('heading', { name: /Keep watching/ })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Connect MyAnimeList', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0);
  await page.goto('/sidebar.html?demo=watching');
  await expect(page.getByText('Following active tab', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open sidebar', exact: true })).toHaveCount(0);
  for (const width of [320, 360, 480]) {
    await page.setViewportSize({ width, height: 850 });
    for (const name of ['Watching', 'Matches', 'Sites', 'Settings']) {
      await page.getByRole('button', { name, exact: true }).click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    await page.getByRole('button', { name: 'Open profile' }).click();
    await expect(page.getByRole('heading', { name: 'animefan' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  await page.setViewportSize({ width: 360, height: 850 });
  await page.getByRole('button', { name: 'Watching', exact: true }).click();
  await page.screenshot({ path: 'artifacts/screenshots/sidebar-watching.png', fullPage: true });
  expect(errors).toEqual([]);
});
