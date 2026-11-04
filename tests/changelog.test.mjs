// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRelease } from '../scripts/prepare-release.mjs';
import {
  checkChangelog,
  changelogMarkdown,
  unreleasedMarkdown,
  validateChangelog,
} from '../scripts/changelog.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'malmark-release-'));
  roots.push(root);
  await mkdir(join(root, 'src/shared'), { recursive: true });
  await mkdir(join(root, 'store'));
  const changelog = {
    unreleased: {
      title: 'Easier navigation',
      sections: [{ title: 'Improved', items: ['Tabs stay visible while scrolling.'] }],
    },
    releases: [
      {
        version: '0.2.0',
        title: 'My list',
        sections: [{ title: 'Added', items: ['View your Watching titles.'] }],
      },
    ],
  };
  const files = {
    'package.json': JSON.stringify({ name: 'fixture', version: '0.2.0' }),
    'package-lock.json': JSON.stringify({
      version: '0.2.0',
      packages: { '': { version: '0.2.0' } },
    }),
    'src/shared/changelog.json': JSON.stringify(changelog),
    'CHANGELOG.md': changelogMarkdown(changelog),
    'store/release-notes-unreleased.md': unreleasedMarkdown(changelog),
  };
  for (const [file, content] of Object.entries(files)) await writeFile(join(root, file), content);
  return { root, changelog };
}
const readJson = async (root, file) => JSON.parse(await readFile(join(root, file), 'utf8'));

describe('release preparation', () => {
  it('assigns the draft version consistently without losing earlier releases', async () => {
    const { root } = await fixture();
    await prepareRelease('0.2.1', root);
    expect((await readJson(root, 'package.json')).version).toBe('0.2.1');
    const lock = await readJson(root, 'package-lock.json');
    expect(lock.version).toBe('0.2.1');
    expect(lock.packages[''].version).toBe('0.2.1');
    const data = await checkChangelog(root);
    expect(data.releases.map((release) => release.version)).toEqual(['0.2.1', '0.2.0']);
    expect(data.unreleased.sections).toEqual([]);
    expect(await readFile(join(root, 'store/release-notes-0.2.1.md'), 'utf8')).toContain(
      'Tabs stay visible',
    );
    await expect(prepareRelease('0.2.1', root)).rejects.toThrow('greater than');
    await expect(prepareRelease('0.2.2', root)).rejects.toThrow('Add user-facing changes');
  });
  it('does not bump a version during checks and detects stale generated notes', async () => {
    const { root } = await fixture();
    await checkChangelog(root);
    expect((await readJson(root, 'package.json')).version).toBe('0.2.0');
    await writeFile(join(root, 'CHANGELOG.md'), 'stale');
    await expect(checkChangelog(root)).rejects.toThrow('stale');
  });
  it('rejects invalid versions and overwriting an existing release before changing files', async () => {
    const { root } = await fixture();
    for (const version of ['0.1.9', '0.2.1-beta', '70000.0.0', '../0.2.1'])
      await expect(prepareRelease(version, root)).rejects.toThrow();
    expect((await readJson(root, 'package.json')).version).toBe('0.2.0');
    await writeFile(join(root, 'store/release-notes-0.2.1.md'), 'existing reviewer notes');
    await expect(prepareRelease('0.2.1', root)).rejects.toThrow('refusing to overwrite');
    expect((await readJson(root, 'package.json')).version).toBe('0.2.0');
  });
  it('rejects missing, duplicate, or out-of-order released notes', async () => {
    const { changelog } = await fixture();
    expect(() => validateChangelog(changelog, '0.2.1')).toThrow('must match');
    changelog.releases.push(changelog.releases[0]);
    expect(() => validateChangelog(changelog, '0.2.0')).toThrow('unique');
  });
});
