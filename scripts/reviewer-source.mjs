import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { zipSync } from 'fflate';

export async function reviewerSource(configuration) {
  const files = {};
  const roots = [
    'src',
    'scripts',
    'tests',
    'store',
    '.nvmrc',
    '.env.example',
    '.gitattributes',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'vitest.config.ts',
    'playwright.config.ts',
    'popup.html',
    'sidebar.html',
    'options.html',
    'README.md',
    'PRIVACY.md',
    'LICENSE',
  ];
  async function walk(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile())
        files[path.replaceAll('\\', '/')] = new Uint8Array(await readFile(path));
      else throw new Error(`Unexpected source entry: ${path}`);
    }
  }
  for (const root of roots) {
    if (['src', 'scripts', 'tests', 'store'].includes(root)) await walk(root);
    else files[root] = new Uint8Array(await readFile(root));
  }
  files['reviewer-config.json'] = new TextEncoder().encode(
    JSON.stringify(
      {
        clientId: configuration.clientId,
        chromiumPublicKey: configuration.chromiumPublicKey,
      },
      null,
      2,
    ) + '\n',
  );
  files['BUILD-FOR-REVIEW.md'] = new TextEncoder().encode(
    `# Rebuild the submitted extension\n\nUse Node.js 24 LTS and npm 11. The original build used ${process.platform} (${process.arch}), Node ${process.version}.\n\nFrom this directory:\n\n1. Run \`npm ci\`. Dependencies come from the npm registry and are pinned in package-lock.json.\n2. Run \`npm run build:review\`. This reads reviewer-config.json, which contains only the public MAL application ID and optional Chrome public key. No .env, client secret, publisher credentials or private signing key is required.\n3. Compare the files in \`dist/firefox\` with the submitted Firefox ZIP, or \`dist/chromium\` with the Chromium ZIP. Compare extracted files, not ZIP timestamps.\n\nAll React UI, content scripts, CSS, icons and dependency notices are generated locally. The build does not download application code. Original third-party packages are installed unchanged from npm; minification/bundling is performed by Vite/Rolldown and esbuild. See store/reviewer-notes.md for runtime test instructions and the two known React DOM lint warnings.\n`,
  );
  await writeFile('artifacts/malmark-store-reviewer-source.zip', zipSync(files));
  console.log('Packaged artifacts/malmark-store-reviewer-source.zip');
}
