import { build as viteBuild, loadEnv } from 'vite';
import { build } from 'esbuild';
import { mkdir, readFile, cp, writeFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import sharp from 'sharp';
import { thirdPartyNotices } from './licenses.mjs';

const env = loadEnv('production', process.cwd(), 'VITE_');
const distribution = process.argv.includes('--store') ? 'store' : 'unpacked';
const clientId = distribution === 'store' ? env.VITE_MAL_CLIENT_ID?.trim() || '' : '';
if (distribution === 'store' && !/^[a-zA-Z0-9_-]{8,128}$/.test(clientId))
  throw new Error(
    'Store builds require VITE_MAL_CLIENT_ID in .env (public app ID, never a secret).',
  );
const define = {
  'import.meta.env.VITE_MAL_CLIENT_ID': JSON.stringify(clientId),
  'import.meta.env.VITE_DISTRIBUTION': JSON.stringify(distribution),
};
const bundledInputs = new Set();
await viteBuild({
  define,
  plugins: [
    {
      name: 'collect-bundled-licenses',
      generateBundle(_options, output) {
        for (const chunk of Object.values(output))
          if (chunk.type === 'chunk')
            for (const id of Object.keys(chunk.modules)) bundledInputs.add(id);
      },
    },
  ],
});
const scripts = await build({
  entryPoints: { background: 'src/background/index.ts', content: 'src/content/index.ts' },
  outdir: 'dist/scripts',
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome121', 'firefox140'],
  minify: true,
  legalComments: 'none',
  metafile: true,
  define,
});
for (const id of Object.keys(scripts.metafile.inputs)) bundledInputs.add(id);
const notices = await thirdPartyNotices([...bundledInputs]);
const sites = ['https://*.crunchyroll.com/*', 'https://crunchyroll.com/*'];
const { version } = JSON.parse(await readFile('package.json', 'utf8'));
const base = {
  manifest_version: 3,
  name: 'Malmark — MyAnimeList episode tracker',
  version,
  description:
    'Track anime on Crunchyroll and confirm MyAnimeList updates. Add other websites yourself with the element picker.',
  permissions: ['storage', 'identity', 'scripting', 'webNavigation', 'activeTab'],
  host_permissions: [...sites, 'https://api.myanimelist.net/*', 'https://myanimelist.net/*'],
  optional_host_permissions: ['https://*/*'],
  action: {
    default_popup: 'popup.html',
    default_title: 'Malmark · Now watching',
    default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
  },
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  options_ui: { page: 'options.html', open_in_tab: true },
  content_scripts: [
    { matches: sites, js: ['content.js'], run_at: 'document_idle', all_frames: true },
  ],
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'none'; base-uri 'none';",
  },
};
const logo = await readFile('src/assets/logo.svg');
for (const target of ['firefox', 'chromium']) {
  const out = `dist/${target}`;
  const absolute = resolve(out);
  if (!absolute.startsWith(resolve('dist') + sep) || !['firefox', 'chromium'].includes(target))
    throw new Error('Invalid build output directory');
  await rm(absolute, { recursive: true, force: true });
  await mkdir(`${out}/icons`, { recursive: true });
  await cp('dist/ui', out, { recursive: true });
  await cp('dist/scripts', out, { recursive: true });
  for (const file of ['LICENSE', 'PRIVACY.md']) await cp(file, `${out}/${file}`);
  await writeFile(`${out}/THIRD_PARTY_NOTICES.md`, notices);
  const manifest = {
    ...base,
    background:
      target === 'firefox' ? { scripts: ['background.js'] } : { service_worker: 'background.js' },
  };
  if (target === 'firefox') {
    manifest.sidebar_action = {
      default_title: 'Malmark',
      default_panel: 'sidebar.html',
      default_icon: { 16: 'icons/icon-16.png', 32: 'icons/icon-32.png' },
      open_at_install: false,
    };
    manifest.browser_specific_settings = {
      gecko: {
        id: 'malmark@mal-episode-watcher.local',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['authenticationInfo', 'browsingActivity', 'websiteContent', 'websiteActivity'],
          optional: [],
        },
      },
      gecko_android: { strict_min_version: '142.0' },
    };
  } else {
    manifest.minimum_chrome_version = '121';
    manifest.permissions = [...base.permissions, 'sidePanel'];
    manifest.side_panel = { default_path: 'sidebar.html' };
  }
  await writeFile(`${out}/manifest.json`, JSON.stringify(manifest, null, 2) + '\n');
  for (const size of [16, 32, 48, 128])
    await sharp(logo).resize(size, size).png().toFile(`${out}/icons/icon-${size}.png`);
  console.log(`Built ${out}`);
}
await writeFile('dist/build-info.json', JSON.stringify({ distribution }) + '\n');
