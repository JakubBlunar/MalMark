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
  const redirectURL = await extensionRedirectURL(remote, addon);
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
        redirectURL,
        manifestSha256: createHash('sha256')
          .update(await readFile('dist/firefox/manifest.json'))
          .digest('hex'),
        scope:
          'Native Firefox temporary installation, background startup and extension redirect URL. Store signing, sidebar interaction, consent UI, MAL OAuth and live playback still require manual verification.',
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    `PASS Native Firefox temporary installation and background startup; no install warnings. MAL callback: ${redirectURL}`,
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

async function extensionRedirectURL(remote, addon) {
  const watcher = await remote.addonRequest(addon, 'getWatcher');
  const client = remote.client;
  let backgroundTarget;
  let completeEvaluation;
  const evaluation = new Promise((resolve) => {
    completeEvaluation = resolve;
  });
  const handleMessage = client._handleMessage.bind(client);
  // This web-ext client predates watcher/evaluation events. Handle only the events
  // needed by this isolated test, leaving normal protocol responses to the client.
  client._handleMessage = (packet) => {
    if (packet.from === watcher.actor && packet.type) {
      if (
        packet.type === 'target-available-form' &&
        packet.target?.url?.endsWith('/_generated_background_page.html')
      )
        backgroundTarget = packet.target;
      return;
    }
    if (packet.type === 'evaluationResult') {
      completeEvaluation(packet);
      return;
    }
    return handleMessage(packet);
  };
  let timer;
  try {
    await client.request({ to: watcher.actor, type: 'watchTargets', targetType: 'frame' });
    if (!backgroundTarget)
      throw new Error('Firefox did not expose the extension background target.');
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Firefox redirect evaluation timed out.')), 10000);
    });
    const result = await Promise.race([
      (async () => {
        await client.request({
          to: backgroundTarget.consoleActor,
          type: 'evaluateJSAsync',
          text: 'browser.identity.getRedirectURL()',
        });
        return evaluation;
      })(),
      deadline,
    ]);
    if (
      result.hasException ||
      typeof result.result !== 'string' ||
      !result.result.startsWith('https://')
    )
      throw new Error('Firefox did not return a valid extension redirect URL.');
    return result.result;
  } finally {
    clearTimeout(timer);
    client._handleMessage = handleMessage;
  }
}
