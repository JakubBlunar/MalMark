import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';
import {
  connectWithMaxRetries,
  findFreeTcpPort,
} from '../node_modules/web-ext/lib/firefox/remote.js';

if (!process.env.MALMARK_FIREFOX_PATH)
  throw new Error('Set MALMARK_FIREFOX_PATH to the installed Firefox executable.');
const root = resolve('artifacts');
await mkdir(root, { recursive: true });
const profile = await mkdtemp(resolve(root, 'firefox-smoke-'));
await writeFile(
  resolve(profile, 'user.js'),
  [
    'user_pref("devtools.debugger.remote-enabled", true);',
    'user_pref("devtools.debugger.prompt-connection", false);',
    'user_pref("devtools.chrome.enabled", true);',
    'user_pref("browser.shell.checkDefaultBrowser", false);',
    'user_pref("browser.startup.homepage_override.mstone", "ignore");',
    'user_pref("browser.startup.page", 0);',
  ].join('\n'),
);
const port = await findFreeTcpPort();
const child = spawn(
  process.env.MALMARK_FIREFOX_PATH,
  [
    '-headless',
    '-no-remote',
    '-profile',
    profile,
    '-start-debugger-server',
    String(port),
    'about:blank',
  ],
  { windowsHide: true, stdio: 'ignore' },
);
let remote;
try {
  remote = await connectWithMaxRetries({ port, maxRetries: 100, retryInterval: 100 });
  await remote.installTemporaryAddon(resolve('dist/firefox'), false);
  const manifest = JSON.parse(await readFile('dist/firefox/manifest.json', 'utf8'));
  const addon = await remote.getInstalledAddon(manifest.browser_specific_settings.gecko.id);
  if (addon.backgroundScriptStatus !== 'RUNNING' || addon.warnings.length)
    throw new Error('Firefox did not start the add-on cleanly.');
  await writeFile(
    'artifacts/firefox-smoke.json',
    JSON.stringify(
      {
        installed: true,
        id: addon.id,
        name: addon.name,
        backgroundScriptStatus: addon.backgroundScriptStatus,
        warnings: addon.warnings,
        version: manifest.version,
        manifestSha256: createHash('sha256')
          .update(await readFile('dist/firefox/manifest.json'))
          .digest('hex'),
        scope:
          'Native Firefox temporary installation and background startup only. Store signing, sidebar interaction, consent UI, MAL OAuth and live playback still require manual verification.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    'PASS Native Firefox temporary installation and background startup; no install warnings.',
  );
} finally {
  remote?.disconnect();
  child.kill();
  await new Promise((resolve) =>
    child.exitCode !== null ? resolve() : child.once('exit', resolve),
  );
  if (!profile.startsWith(root + sep)) throw new Error('Unsafe isolated Firefox profile');
  await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
