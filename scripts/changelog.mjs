import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const browserVersion = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
export function compareVersions(left, right) {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

export function validateChangelog(data, version) {
  if (!browserVersion.test(version) || version.split('.').some((part) => Number(part) > 65535))
    throw new Error('Use a browser-compatible version such as 0.2.1.');
  if (!data?.unreleased || !Array.isArray(data.releases) || !data.releases.length)
    throw new Error('Changelog needs an unreleased draft and release history.');
  let previous;
  for (const entry of [data.unreleased, ...data.releases]) {
    if (typeof entry.title !== 'string' || !entry.title.trim() || !Array.isArray(entry.sections))
      throw new Error('Each changelog entry needs a title and sections.');
    const sections = new Set();
    for (const section of entry.sections) {
      if (
        typeof section.title !== 'string' ||
        !section.title.trim() ||
        sections.has(section.title) ||
        !Array.isArray(section.items) ||
        !section.items.length ||
        section.items.some(
          (item) => typeof item !== 'string' || !item.trim() || /[\r\n]/.test(item),
        )
      )
        throw new Error('Changelog sections need unique titles and non-empty, single-line notes.');
      sections.add(section.title);
    }
    if (entry === data.unreleased) continue;
    if (!browserVersion.test(entry.version) || !entry.sections.length)
      throw new Error('Each released version needs a valid version and public notes.');
    if (previous && compareVersions(previous, entry.version) <= 0)
      throw new Error('Release versions must be unique and ordered newest first.');
    previous = entry.version;
  }
  if (data.releases[0].version !== version)
    throw new Error(
      `Latest release notes must match package.json version ${version}. Run npm run release:prepare -- <version> when preparing a new release.`,
    );
}

function sectionsMarkdown(entry) {
  return entry.sections.length
    ? entry.sections
        .map(
          (section) =>
            `### ${section.title}\n\n${section.items.map((item) => `- ${item}`).join('\n')}\n`,
        )
        .join('\n')
    : 'No unreleased changes.\n';
}

export function changelogMarkdown(data) {
  const history = data.releases
    .map((release) => `## ${release.version} — ${release.title}\n\n${sectionsMarkdown(release)}`)
    .join('\n');
  return `# Changelog\n\nUser-facing changes in Malmark. The installed app includes its current release and up to three earlier versions under Settings → What’s new.\n\n## Unreleased\n\n${sectionsMarkdown(data.unreleased)}\n${history}`;
}

export function unreleasedMarkdown(data) {
  return `# Unreleased\n\n${sectionsMarkdown(data.unreleased)}`;
}

export function releaseMarkdown(release) {
  return `# Malmark ${release.version}\n\n## Release notes\n\n${release.title}\n\n${sectionsMarkdown(release)}`;
}

export async function checkChangelog(root = process.cwd(), write = false) {
  const data = JSON.parse(await readFile(resolve(root, 'src/shared/changelog.json'), 'utf8'));
  const { version } = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  validateChangelog(data, version);
  for (const [file, content] of [
    ['CHANGELOG.md', changelogMarkdown(data)],
    ['store/release-notes-unreleased.md', unreleasedMarkdown(data)],
  ]) {
    if (write) await writeFile(resolve(root, file), content);
    else if ((await readFile(resolve(root, file), 'utf8')).replaceAll('\r\n', '\n') !== content)
      throw new Error(`${file} is stale. Run npm run changelog:write.`);
  }
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await checkChangelog(process.cwd(), process.argv.includes('--write'));
  console.log(
    process.argv.includes('--write')
      ? 'Updated public changelogs.'
      : 'Changelog and installed version match.',
  );
}
