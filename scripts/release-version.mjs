import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateReleaseVersion(tag, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version) || tag !== `v${version}`)
    throw new Error(`Release tag must be v${version}, matching package.json's browser version.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  validateReleaseVersion(process.env.RELEASE_TAG, version);
  console.log(`Validated release ${process.env.RELEASE_TAG}.`);
}
