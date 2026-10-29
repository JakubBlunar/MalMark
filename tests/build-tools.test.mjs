// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { bundledPackageRoots, thirdPartyNotices } from '../scripts/licenses.mjs';
import { validateReleaseVersion } from '../scripts/release-version.mjs';

describe('release packaging', () => {
  it('recognizes bundled scoped, nested and repeated package inputs', () => {
    const root = resolve('node_modules').replaceAll('\\', '/');
    expect(
      bundledPackageRoots([
        `${root}/react/index.js`,
        `${root}/react/jsx-runtime.js?commonjs-proxy`,
        `${root}/@example/library/dist/index.js`,
        `${root}/outer/node_modules/inner/dist/index.js`,
        resolve('src/ui/App.tsx'),
        '\0virtual:runtime',
      ]),
    ).toEqual([`${root}/@example/library`, `${root}/outer/node_modules/inner`, `${root}/react`]);
  });
  it('includes bundled dependency licenses and the matching MPL source location automatically', async () => {
    const notices = await thirdPartyNotices([
      'node_modules/react/index.js',
      'node_modules/react-dom/client.js',
      'node_modules/scheduler/index.js',
      'node_modules/lucide-react/dist/cjs/lucide-react.js',
      'node_modules/webextension-polyfill/dist/browser-polyfill.js',
    ]);
    for (const pkg of [
      'react',
      'react-dom',
      'scheduler',
      'lucide-react',
      'webextension-polyfill',
      'vite',
      'rolldown',
      'esbuild',
    ])
      expect(notices).toContain(`## ${pkg} `);
    expect(notices).toContain('https://github.com/mozilla/webextension-polyfill/tree/0.12.0');
    expect(notices).toContain('Mozilla Public License Version 2.0');
    expect(notices).toContain('Permission is hereby granted');
  });
  it('requires a matching browser version tag before publishing', () => {
    expect(() => validateReleaseVersion('v0.1.0', '0.1.0')).not.toThrow();
    for (const tag of ['v0.2.0', '0.1.0', 'v0.1.0-beta', undefined])
      expect(() => validateReleaseVersion(tag, '0.1.0')).toThrow('Release tag must be v0.1.0');
  });
});
