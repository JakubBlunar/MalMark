import { zipSync } from 'fflate';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { reviewerSource } from './reviewer-source.mjs';
import { packageManifest } from './build-config.mjs';
import { checkChangelog, releaseMarkdown } from './changelog.mjs';
const changelog = await checkChangelog();
await mkdir('artifacts', { recursive: true });
const configuration = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
const { distribution } = configuration;
if (!['store', 'unpacked'].includes(distribution)) throw new Error('Unknown build distribution.');
const prefix = distribution === 'store' ? 'malmark-store' : 'malmark';
for (const target of ['firefox', 'chromium']) {
  const files = {};
  async function walk(path, prefix = '') {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isDirectory()) await walk(join(path, entry.name), prefix + entry.name + '/');
      else files[prefix + entry.name] = new Uint8Array(await readFile(join(path, entry.name)));
    }
  }
  await walk(`dist/${target}`);
  const manifest = JSON.parse(new TextDecoder().decode(files['manifest.json']));
  if (manifest.version !== changelog.releases[0].version)
    throw new Error('Built version differs from the changelog. Rebuild before packaging.');
  files['manifest.json'] = new TextEncoder().encode(
    JSON.stringify(packageManifest(manifest, target, distribution), null, 2) + '\n',
  );
  await writeFile(`artifacts/${prefix}-${target}.zip`, zipSync(files));
  console.log(`Packaged artifacts/${prefix}-${target}.zip`);
}
await writeFile('artifacts/malmark-release-notes.md', releaseMarkdown(changelog.releases[0]));
if (distribution === 'store') await reviewerSource(configuration);
