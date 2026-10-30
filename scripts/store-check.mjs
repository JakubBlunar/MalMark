import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import sharp from 'sharp';
import { chromiumId } from './build-config.mjs';

const configuration = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
if (configuration.distribution !== 'store')
  throw new Error('Build the store profile first: npm run package:store');
const listing = JSON.parse(await readFile('store/listing.json', 'utf8'));
if (
  !listing.name ||
  listing.name.length > 75 ||
  !listing.firefoxName ||
  listing.firefoxName.length > 30 ||
  listing.shortDescription.length > 132 ||
  listing.firefoxSummary.length > 250
)
  throw new Error('Listing name or summary exceeds a store limit.');
const checks = [];
const artifacts = [];
for (const target of ['chromium', 'firefox']) {
  const file = `artifacts/malmark-store-${target}.zip`;
  const bytes = await readFile(file);
  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (target === 'firefox' && manifest.browser_specific_settings.gecko_android)
    throw new Error('The initial store release is desktop-only; Android has not been validated.');
  if (target === 'chromium') {
    if (Object.hasOwn(manifest, 'key'))
      throw new Error('The Chrome Web Store upload ZIP must not contain manifest.key.');
    const localManifest = JSON.parse(await readFile('dist/chromium/manifest.json', 'utf8'));
    if (localManifest.key !== (configuration.chromiumPublicKey || undefined))
      throw new Error('Local Chromium public key differs from the recorded build configuration.');
    checks.push(
      'Chrome upload omits manifest.key; the unpacked local build keeps its configured key',
    );
  }
  const expectedName = target === 'firefox' ? listing.firefoxName : listing.name;
  if (manifest.name !== expectedName || manifest.description !== listing.shortDescription)
    throw new Error('Manifest/listing mismatch.');
  if (
    manifest.manifest_version !== 3 ||
    !manifest.permissions.includes('identity') ||
    manifest.host_permissions.includes('https://*/*')
  )
    throw new Error('Unexpected manifest or required broad host permission.');
  if (
    manifest.content_security_policy.extension_pages !==
    "script-src 'self'; object-src 'none'; base-uri 'none';"
  )
    throw new Error('Unexpected extension CSP.');
  if (
    target === 'chromium' &&
    (!manifest.background.service_worker ||
      manifest.background.scripts ||
      !manifest.side_panel ||
      manifest.sidebar_action)
  )
    throw new Error('Invalid Chromium background/sidebar configuration.');
  if (
    target === 'firefox' &&
    (!manifest.background.scripts ||
      manifest.background.service_worker ||
      !manifest.sidebar_action ||
      manifest.side_panel)
  )
    throw new Error('Invalid Firefox background/sidebar configuration.');
  for (const name of [
    'popup.html',
    'options.html',
    'sidebar.html',
    'LICENSE',
    'PRIVACY.md',
    'THIRD_PARTY_NOTICES.md',
  ])
    if (!files[name]) throw new Error(`Missing ${name}`);
  if (!strFromU8(files['background.js']).includes(configuration.clientId))
    throw new Error('Store application ID missing from the background build.');
  for (const name of Object.keys(files))
    if (/(^|\/)(?:\.env(?:\.|$)|node_modules|\.git)(?:\/|$)|\.(?:pem|key)$/.test(name))
      throw new Error(`Private/development input in browser ZIP: ${name}`);
  artifacts.push({ file, sha256: createHash('sha256').update(bytes).digest('hex') });
  checks.push(
    `${target}: MV3 configuration, package contents, public-client store profile and privacy/license files`,
  );
}
const source = unzipSync(await readFile('artifacts/malmark-store-reviewer-source.zip'));
for (const name of [
  'BUILD-FOR-REVIEW.md',
  'reviewer-config.json',
  'package-lock.json',
  'src/background/index.ts',
  'scripts/build.mjs',
])
  if (!source[name]) throw new Error(`Missing reviewer source: ${name}`);
for (const name of Object.keys(source))
  if (
    name === '.env' ||
    /(^|\/)release-audit\.md$/.test(name) ||
    name.startsWith('.git/') ||
    name.startsWith('node_modules/') ||
    /\.(?:pem|key)$/.test(name)
  )
    throw new Error(`Private source input: ${name}`);
for (const [name, bytes] of Object.entries(source)) {
  if (['BUILD-FOR-REVIEW.md', 'reviewer-config.json'].includes(name)) continue;
  if (!Buffer.from(bytes).equals(await readFile(name)))
    throw new Error(`Reviewer sources are stale: ${name}. Run npm run package:store again.`);
}
const supplied = JSON.parse(strFromU8(source['reviewer-config.json']));
if (
  supplied.clientId !== configuration.clientId ||
  supplied.chromiumPublicKey !== configuration.chromiumPublicKey
)
  throw new Error('Reviewer configuration differs from the store build.');
checks.push('Matching reviewer-source archive with public configuration and lockfile');
const images = JSON.parse(await readFile('artifacts/store/images.json', 'utf8'));
for (const store of ['chrome', 'firefox'])
  for (const image of images.screenshots) {
    const metadata = await sharp(`artifacts/store/${store}/screenshots/${image.id}.png`).metadata();
    if (metadata.width !== 1280 || metadata.height !== 800 || metadata.format !== 'png')
      throw new Error(`Invalid screenshot dimensions: ${image.id}`);
  }
for (const [file, width, height] of [
  ['chrome/icon-128.png', 128, 128],
  ['firefox/icon-64.png', 64, 64],
  ['chrome/promo-440x280.png', 440, 280],
  ['chrome/marquee-1400x560.png', 1400, 560],
]) {
  const metadata = await sharp(`artifacts/store/${file}`).metadata();
  if (metadata.width !== width || metadata.height !== height)
    throw new Error(`Invalid asset: ${file}`);
}
checks.push('Five correctly sized screenshots per store, icons and Chrome promotional images');
const pending = [
  'Publish/verify the privacy and support URLs from listing.json.',
  'Register final Chrome and Firefox redirect URLs in the public MAL app.',
  'Verify real MAL login, refresh, playback and an approved list write in the final desktop browsers.',
  'Complete publisher verification, accurate trader declaration, dashboard privacy fields and private reviewer credentials.',
  'Submit the matching Firefox source ZIP and review the final dashboard previews.',
];
if (!configuration.chromiumPublicKey)
  pending.unshift(
    'Chrome store public key is not configured; obtain the draft item ID/key and pin it for local OAuth testing.',
  );
const report = {
  automatedChecksPassed: true,
  readyToPublish: false,
  checks,
  artifacts,
  chromeRedirectForPinnedBuild: configuration.chromiumPublicKey
    ? `https://${chromiumId(configuration.chromiumPublicKey)}.chromiumapp.org/`
    : null,
  pending,
};
await writeFile('artifacts/store-readiness.json', JSON.stringify(report, null, 2) + '\n');
for (const check of checks) console.log(`PASS ${check}`);
console.log(
  `Preparation checks passed; ${pending.length} publishing checks still require account/live verification. See artifacts/store-readiness.json.`,
);
