import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { format } from 'prettier';

const require = createRequire(import.meta.url);

export function bundledPackageRoots(inputs) {
  const roots = new Set();
  for (const input of inputs) {
    const path = resolve(input.replaceAll('\0', '').split('?')[0]).replaceAll('\\', '/');
    const index = path.lastIndexOf('/node_modules/');
    if (index < 0) continue;
    const parts = path.slice(index + '/node_modules/'.length).split('/');
    const packageName = parts[0].startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
    roots.add(path.slice(0, index + '/node_modules/'.length) + packageName);
  }
  return [...roots].sort();
}

export async function thirdPartyNotices(inputs) {
  const roots = new Set(bundledPackageRoots(inputs));
  // These tools also emit runtime helpers without a node_modules module ID.
  for (const name of ['vite', 'rolldown', 'esbuild'])
    roots.add(resolve(require.resolve(`${name}/package.json`), '..'));
  const sections = [
    '# Third-party notices',
    'Malmark’s own code is licensed under ELv2. The dependencies and generated runtime helpers below retain their original licenses; ELv2 does not restrict rights granted by those licenses. Build tools not included in the distributed extension retain the licenses in their respective packages.',
  ];
  const packages = await Promise.all(
    [...roots].map(async (root) => ({
      root,
      pkg: JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8')),
    })),
  );
  for (const { root, pkg } of packages.sort((a, b) => a.pkg.name.localeCompare(b.pkg.name))) {
    const licenses = (await readdir(root)).filter((file) =>
      /^(?:license|copying|notice)(?:\.|$)/i.test(file),
    );
    if (!licenses.length) throw new Error(`Missing dependency license: ${pkg.name}`);
    sections.push(`## ${pkg.name} ${pkg.version}`, `License: ${pkg.license}.`);
    if (pkg.name === 'webextension-polyfill') {
      sections.push(
        `The MPL-covered library is unmodified in source form and is bundled/minified for distribution. Its preferred source, API metadata and build files are available under MPL-2.0 at [Mozilla’s version ${pkg.version} source](https://github.com/mozilla/webextension-polyfill/tree/${pkg.version}). Recipients retain all rights to the MPL-covered source under MPL-2.0.`,
      );
    }
    for (const file of licenses.sort()) {
      sections.push(
        '```text\n' + (await readFile(resolve(root, file), 'utf8')).trimEnd() + '\n```',
      );
    }
  }
  return format(sections.join('\n\n') + '\n', { parser: 'markdown' });
}
