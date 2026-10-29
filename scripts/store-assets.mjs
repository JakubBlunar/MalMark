import { chromium } from '@playwright/test';
import sharp from 'sharp';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { zipSync } from 'fflate';

const output = resolve('artifacts/store');
await mkdir(`${output}/chrome/screenshots`, { recursive: true });
await mkdir(`${output}/firefox/screenshots`, { recursive: true });
await mkdir(`${output}/raw`, { recursive: true });
await mkdir(`${output}/high-resolution`, { recursive: true });
const logo = await readFile('src/assets/logo.svg');
const logoUrl = `data:image/svg+xml;base64,${logo.toString('base64')}`;
const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="560" viewBox="0 0 400 560"><defs><linearGradient id="sky" x2=".7" y2="1"><stop stop-color="#333454"/><stop offset="1" stop-color="#142c31"/></linearGradient></defs><rect width="400" height="560" fill="url(#sky)"/><circle cx="277" cy="140" r="69" fill="#baacf0"/><path d="M0 378 120 265 235 365 325 310 400 388V560H0" fill="#4c6870"/><path d="M0 440 150 366 260 435 400 368V560H0" fill="#24474d"/><path d="M178 560c120-100-70-95 34-172" fill="none" stroke="#9ab7bb" stroke-width="14" opacity=".7"/><g fill="#e8dcff"><circle cx="84" cy="113" r="3"/><circle cx="150" cy="72" r="2"/><circle cx="204" cy="202" r="2"/><circle cx="355" cy="72" r="2"/><circle cx="43" cy="240" r="2"/></g><path d="M55 357h45v41H55zM48 357h59l-30-28z" fill="#121e2b"/><text x="200" y="498" text-anchor="middle" font-family="sans-serif" font-size="14" letter-spacing="4" fill="#d7e2e3">SAMPLE ARTWORK</text></svg>`;
const coverUrl = `data:image/svg+xml;base64,${Buffer.from(cover).toString('base64')}`;
const profile = await mkdtemp(resolve('artifacts', 'store-capture-'));
const extension = resolve('dist/chromium');
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chromium',
  headless: true,
  executablePath: process.env.MALMARK_BROWSER_PATH,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 420, height: 704 },
  deviceScaleFactor: 2,
});
const scenarios = [
  {
    id: '01-watching',
    name: 'Watching',
    eyebrow: 'YOUR WATCH COMPANION',
    title: 'Keep watching.<br>Keep your place.',
    description: 'Track anime on Crunchyroll and keep your MyAnimeList list close by.',
    detail: 'Watched sections survive browser restarts',
    view: 'watching',
  },
  {
    id: '02-review',
    name: 'Episode approval',
    eyebrow: 'YOUR LIST. YOUR SAY.',
    title: 'One episode.<br>Your approval.',
    description: 'Review each update before it reaches your list—even after autoplay moves on.',
    detail: 'Every list change needs your approval',
    view: 'watching',
  },
  {
    id: '03-matching',
    name: 'Manual anime matching',
    eyebrow: 'THE RIGHT SEASON',
    title: 'Find the match.<br>Make it stick.',
    description:
      'Pick the correct MAL entry and save episode offsets when a site needs a little help.',
    detail: 'Saved locally for next time',
    view: 'matches',
  },
  {
    id: '04-completion',
    name: 'Completion and scoring',
    eyebrow: 'ANOTHER SERIES, FINISHED',
    title: 'Finish the story.<br>Leave your score.',
    description: 'Complete Finished Airing anime after the final episode. Add a score if you want.',
    detail: 'MAL eligibility is checked before saving',
    view: 'watching',
  },
  {
    id: '05-websites',
    name: 'Optional website setup',
    eyebrow: 'YOUR WEBSITE. YOUR WAY.',
    title: 'Pick the title.<br>Track the episode.',
    description: 'Add other websites with the element picker and permission for each domain.',
    detail: 'Crunchyroll is built in; other sites need setup',
    view: 'sites',
  },
];
const manifest = [];
try {
  const worker = context.serviceWorkers()[0] || (await context.waitForEvent('serviceworker'));
  const id = new URL(worker.url()).host;
  await worker.evaluate(async (coverUrl) => {
    const root = globalThis;
    root.storeAnime = {
      id: 900001,
      title: 'The Last Observatory',
      main_picture: { medium: coverUrl },
      num_episodes: 12,
      status: 'finished_airing',
      media_type: 'tv',
      start_season: { year: 2026, season: 'spring' },
      my_list_status: { status: 'watching', num_episodes_watched: 7, score: 0 },
    };
    root.fetch = async (url) =>
      new Response(
        JSON.stringify(
          url.includes('/anime?')
            ? {
                data: [
                  { node: root.storeAnime },
                  {
                    node: {
                      ...root.storeAnime,
                      id: 900002,
                      title: 'The Last Observatory: A New Dawn',
                      num_episodes: 12,
                    },
                  },
                ],
              }
            : root.storeAnime,
        ),
      );
    await root.chrome.storage.local.set({
      auth: {
        accessToken: 'store-screenshot-fixture',
        refreshToken: 'store-screenshot-fixture',
        clientId: 'store-fixture',
        expiresAt: Date.now() + 3600000,
        profile: { id: 4242, name: 'MalmarkDemo' },
      },
    });
  }, coverUrl);
  await context.route('https://www.crunchyroll.com/watch/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<html><head><title>Season 1 - Watch on Crunchyroll</title></head><body><a href="/series/DEMO/the-last-observatory">The Last Observatory</a><h1>Episode 8</h1></body></html>',
    }),
  );
  const watch = await context.newPage();
  await watch.goto('https://www.crunchyroll.com/watch/STORE-DEMO/episode');
  const tabId = await worker.evaluate(
    async () =>
      (await globalThis.chrome.tabs.query({ url: 'https://www.crunchyroll.com/watch/*' }))[0].id,
  );
  await worker.evaluate(async (tabId) => {
    await globalThis.chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__malmarkController?.stop(),
    });
  }, tabId);
  const template = await readFile('store/screenshot-frame.html', 'utf8');
  const composition = await context.newPage();
  await composition.setViewportSize({ width: 1280, height: 800 });
  for (const scene of scenarios) {
    await worker.evaluate(
      async ({ scene, tabId }) => {
        const root = globalThis;
        const anime = structuredClone(root.storeAnime);
        if (scene.id === '04-completion') {
          anime.my_list_status.num_episodes_watched = 12;
          anime.my_list_status.score = 8;
        }
        const detection = {
          site: 'crunchyroll',
          title: anime.title,
          episode: scene.id === '04-completion' ? 12 : 8,
          season: 1,
          url: 'https://www.crunchyroll.com/watch/STORE-DEMO/episode',
          seriesKey: 'crunchyroll:DEMO:s1',
        };
        const session = {
          detection,
          anime,
          match: 'matched',
          matchSource: 'automatic',
          episode: detection.episode,
          frameOrigins: [],
          progress: {
            ranges: [[0, 1044]],
            duration: 1440,
            watched: 1044,
            position: 1150,
            last: {
              videoId: 'store-fixture',
              currentTime: 1150,
              duration: 1440,
              paused: false,
              ended: false,
              rate: 1,
              sentAt: Date.now(),
            },
          },
          playerConnected: true,
          updatedAt: Date.now(),
        };
        const pending =
          scene.id === '02-review'
            ? [
                {
                  id: '4242:900001:8',
                  anime,
                  episode: 8,
                  previous: 7,
                  createdAt: Date.now(),
                  tabId,
                },
              ]
            : [];
        const sites =
          scene.id === '05-websites'
            ? [
                {
                  id: 'sample',
                  origin: 'https://video.example',
                  titleSelector: '.anime-title',
                  episodeSelector: '.current-episode',
                  createdAt: Date.now(),
                },
              ]
            : [];
        await root.chrome.storage.local.set({ pending, sites });
        await root.chrome.storage.session.set({ [`tab:${tabId}`]: session });
      },
      { scene, tabId },
    );
    const ui = await context.newPage();
    await ui.goto(`chrome-extension://${id}/popup.html?tab=${tabId}&view=${scene.view}`);
    await ui.getByRole('navigation').waitFor();
    async function activate(page) {
      if (scene.id === '03-matching') {
        await page.getByRole('button', { name: 'Search anime' }).click();
        await page.locator('.search-result').first().click();
      } else if (scene.id === '04-completion') {
        await page.getByRole('button', { name: 'Complete & rate' }).click();
        await page.getByLabel('Your score').selectOption('9');
        await page.getByRole('button', { name: 'Save completion' }).scrollIntoViewIfNeeded();
      } else if (scene.id === '05-websites') await page.locator('.custom-site summary').click();
    }
    await activate(ui);
    await ui.evaluate(() => document.fonts.ready);
    const screen = await ui.screenshot({ animations: 'disabled' });
    await writeFile(`${output}/raw/${scene.id}.png`, screen);
    let html = template;
    for (const [key, value] of Object.entries({
      LOGO: logoUrl,
      SCREEN: `data:image/png;base64,${screen.toString('base64')}`,
      EYEBROW: scene.eyebrow,
      TITLE: scene.title,
      DESCRIPTION: scene.description,
      DETAIL: scene.detail,
    }))
      html = html.replaceAll(`{{${key}}}`, value);
    await composition.setContent(html);
    await composition.evaluate(() =>
      Promise.all([...document.images].map((image) => image.decode())),
    );
    const chromeImage = await composition.screenshot({ animations: 'disabled', scale: 'device' });
    await sharp(chromeImage)
      .removeAlpha()
      .png()
      .toFile(`${output}/high-resolution/${scene.id}.png`);
    await sharp(chromeImage)
      .resize(1280, 800)
      .removeAlpha()
      .png()
      .toFile(`${output}/chrome/screenshots/${scene.id}.png`);
    await ui.close();

    // The shared options UI provides a clean, browser-neutral full-window capture for AMO.
    const firefox = await context.newPage();
    await firefox.setViewportSize({ width: 1280, height: 800 });
    await firefox.goto(`chrome-extension://${id}/options.html?tab=${tabId}&view=${scene.view}`);
    await firefox.getByRole('navigation').waitFor();
    await activate(firefox);
    const firefoxImage = await firefox.screenshot({ animations: 'disabled', scale: 'css' });
    const sampleLabel = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800"><rect x="1010" y="766" width="250" height="22" rx="6" fill="#101218"/><text x="1248" y="781" text-anchor="end" font-family="sans-serif" font-size="11" fill="#9298a9">Sample data · Shared Malmark interface</text></svg>',
    );
    await sharp(firefoxImage)
      .removeAlpha()
      .composite([{ input: sampleLabel }])
      .png()
      .toFile(`${output}/firefox/screenshots/${scene.id}.png`);
    await firefox.close();
    manifest.push({ id: scene.id, caption: scene.name, sampleData: true });
    console.log(`Captured ${scene.id}`);
  }
} finally {
  await context.close();
  if (!profile.startsWith(resolve('artifacts') + sep))
    throw new Error('Unsafe screenshot profile path');
  await rm(profile, { recursive: true, force: true });
}

await sharp(logo)
  .resize(96, 96)
  .extend({ top: 16, left: 16, bottom: 16, right: 16, background: '#00000000' })
  .png()
  .toFile(`${output}/chrome/icon-128.png`);
await sharp(logo).resize(64, 64).png().toFile(`${output}/firefox/icon-64.png`);
for (const [width, height, name] of [
  [440, 280, 'promo-440x280'],
  [1400, 560, 'marquee-1400x560'],
]) {
  const iconSize = Math.round(height * 0.48);
  const backdrop = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs><radialGradient id="glow"><stop stop-color="#6f55ad"/><stop offset="1" stop-color="#171523"/></radialGradient></defs><rect width="100%" height="100%" fill="#171523"/><ellipse cx="${width * 0.5}" cy="${height * 0.5}" rx="${width * 0.6}" ry="${height * 0.9}" fill="url(#glow)"/><g fill="none" stroke="#b8a0f044" stroke-width="2"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.35}" ry="${height * 0.29}"/><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.44}" ry="${height * 0.4}"/></g><g fill="#8ae2bd"><circle cx="${width * 0.19}" cy="${height * 0.32}" r="${height * 0.027}"/><circle cx="${width * 0.81}" cy="${height * 0.67}" r="${height * 0.027}"/></g><circle cx="${width * 0.83}" cy="${height * 0.26}" r="${height * 0.015}" fill="#c4b5ff"/></svg>`;
  await sharp(Buffer.from(backdrop))
    .composite([
      {
        input: await sharp(logo).resize(iconSize, iconSize).png().toBuffer(),
        left: Math.round((width - iconSize) / 2),
        top: Math.round((height - iconSize) / 2),
      },
    ])
    .removeAlpha()
    .png()
    .toFile(`${output}/chrome/${name}.png`);
}
const cells = [];
const contactScenes = scenarios.slice(0, 4);
const tileWidth = 2560;
const tileHeight = 1600;
const gap = 48;
for (let index = 0; index < contactScenes.length; index++)
  cells.push({
    input: await readFile(`${output}/high-resolution/${contactScenes[index].id}.png`),
    left: (index % 2) * (tileWidth + gap) + gap,
    top: Math.floor(index / 2) * (tileHeight + gap) + gap,
  });
await sharp({
  create: {
    width: 2 * tileWidth + 3 * gap,
    height: 2 * tileHeight + 3 * gap,
    channels: 3,
    background: '#11131b',
  },
})
  .composite(cells)
  .png()
  .toFile(`${output}/contact-sheet.png`);
await writeFile(
  `${output}/images.json`,
  JSON.stringify(
    {
      generatedFrom:
        'Actual packaged extension UI, captured in isolated Chromium; shared UI captures are also provided for Firefox. All account/anime data and artwork are illustrative.',
      screenshots: manifest,
    },
    null,
    2,
  ) + '\n',
);
const archive = {};
archive['contact-sheet.png'] = new Uint8Array(await readFile(`${output}/contact-sheet.png`));
for (const scene of scenarios)
  archive[`high-resolution/${scene.id}.png`] = new Uint8Array(
    await readFile(`${output}/high-resolution/${scene.id}.png`),
  );
for (const store of ['chrome', 'firefox']) {
  archive[`${store}-description.txt`] = new Uint8Array(
    await readFile(`store/${store}-description.txt`),
  );
  for (const scene of scenarios)
    archive[`${store}/screenshots/${scene.id}.png`] = new Uint8Array(
      await readFile(`${output}/${store}/screenshots/${scene.id}.png`),
    );
}
for (const [store, files] of [
  ['chrome', ['icon-128.png', 'promo-440x280.png', 'marquee-1400x560.png']],
  ['firefox', ['icon-64.png']],
])
  for (const file of files)
    archive[`${store}/${file}`] = new Uint8Array(await readFile(`${output}/${store}/${file}`));
archive['listing.json'] = new Uint8Array(await readFile('store/listing.json'));
archive['images.json'] = new Uint8Array(await readFile(`${output}/images.json`));
await writeFile('artifacts/malmark-store-listing-assets.zip', zipSync(archive));
console.log(
  'Generated artifacts/store/contact-sheet.png and artifacts/malmark-store-listing-assets.zip',
);
