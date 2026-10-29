import { mkdir, mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync } from 'fflate';

const root = resolve('artifacts');
const temporary = await mkdtemp(resolve(root, 'review-build-'));
try {
  const files = unzipSync(await readFile('artifacts/malmark-store-reviewer-source.zip'));
  for (const [name, data] of Object.entries(files)) {
    const destination = resolve(temporary, name);
    if (!destination.startsWith(temporary + sep)) throw new Error('Unsafe source archive path');
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, data);
  }
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run this verification through npm run verify:review.');
  execFileSync(process.execPath, [npm, 'ci', '--offline'], { cwd: temporary, stdio: 'inherit' });
  execFileSync(process.execPath, [npm, 'run', 'build:review'], {
    cwd: temporary,
    stdio: 'inherit',
  });
  const counts = {};
  for (const target of ['chromium', 'firefox']) {
    const expected = unzipSync(await readFile(`artifacts/malmark-store-${target}.zip`));
    const rebuilt = {};
    async function walk(folder, prefix = '') {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        const path = resolve(folder, entry.name);
        const name = prefix + entry.name;
        if (entry.isDirectory()) await walk(path, name + '/');
        else rebuilt[name] = await readFile(path);
      }
    }
    await walk(resolve(temporary, 'dist', target));
    if (Object.keys(expected).length !== Object.keys(rebuilt).length)
      throw new Error(`${target}: rebuilt file count differs`);
    for (const [name, data] of Object.entries(expected))
      if (!rebuilt[name] || !Buffer.from(data).equals(rebuilt[name]))
        throw new Error(`${target}: rebuilt content differs: ${name}`);
    counts[target] = Object.keys(expected).length;
    console.log(`${target}: ${counts[target]} extracted files reproduced byte for byte`);
  }
  await writeFile(
    'artifacts/reviewer-reproducibility.json',
    JSON.stringify(
      {
        verified: true,
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        counts,
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  if (!temporary.startsWith(root + sep)) throw new Error('Unsafe source verification directory');
  await rm(temporary, { recursive: true, force: true });
}
