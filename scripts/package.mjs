import { zipSync } from 'fflate';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
await mkdir('artifacts', { recursive: true });
const { distribution } = JSON.parse(await readFile('dist/build-info.json', 'utf8'));
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
  await writeFile(`artifacts/${prefix}-${target}.zip`, zipSync(files));
  console.log(`Packaged artifacts/${prefix}-${target}.zip`);
}
