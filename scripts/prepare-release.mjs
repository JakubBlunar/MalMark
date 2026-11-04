import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  browserVersion,
  compareVersions,
  validateChangelog,
  changelogMarkdown,
  unreleasedMarkdown,
  releaseMarkdown,
} from './changelog.mjs';

export async function prepareRelease(version, root = process.cwd()) {
  const readJson = async (file) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
  const [pkg, lock, changelog] = await Promise.all([
    readJson('package.json'),
    readJson('package-lock.json'),
    readJson('src/shared/changelog.json'),
  ]);
  validateChangelog(changelog, pkg.version);
  if (!browserVersion.test(version) || compareVersions(version, pkg.version) <= 0)
    throw new Error(
      `Choose a new version greater than ${pkg.version}: npm run release:prepare -- <version>.`,
    );
  if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version)
    throw new Error(
      'package.json and package-lock.json versions must match before preparing a release.',
    );
  if (!changelog.unreleased.sections.length)
    throw new Error('Add user-facing changes to src/shared/changelog.json under unreleased first.');
  const notesPath = resolve(root, `store/release-notes-${version}.md`);
  const exists = await access(notesPath).then(
    () => true,
    () => false,
  );
  if (exists)
    throw new Error(`Release notes for ${version} already exist; refusing to overwrite them.`);
  const release = { version, ...changelog.unreleased };
  changelog.releases.unshift(release);
  changelog.unreleased = { title: 'Upcoming changes', sections: [] };
  validateChangelog(changelog, version);
  pkg.version = version;
  lock.version = version;
  lock.packages[''].version = version;
  const json = (value) => JSON.stringify(value, null, 2) + '\n';
  // Validate all inputs before changing any files. Ordinary builds never call this command.
  for (const [file, content] of [
    ['package.json', json(pkg)],
    ['package-lock.json', json(lock)],
    ['src/shared/changelog.json', json(changelog)],
    ['CHANGELOG.md', changelogMarkdown(changelog)],
    ['store/release-notes-unreleased.md', unreleasedMarkdown(changelog)],
    [`store/release-notes-${version}.md`, releaseMarkdown(release)],
  ])
    await writeFile(resolve(root, file), content);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const version = process.argv[2];
  await prepareRelease(version);
  console.log(
    `Prepared Malmark ${version}: version, changelog, and public release notes updated. Nothing was published. Build with npm run package:store or npm run package.`,
  );
}
