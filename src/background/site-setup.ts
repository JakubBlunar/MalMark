import browser from 'webextension-polyfill';

interface PendingSetup {
  requestId: string;
  url: string;
  origin: string;
  expiresAt: number;
}

const samePage = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];

export async function startSiteSetup(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || new URL(tab.url).protocol !== 'https:')
    throw new Error(
      'Open an HTTPS anime watch page, then start website setup from its Malmark popup.',
    );
  const origin = new URL(tab.url).origin;
  if (!(await browser.permissions.contains({ origins: [origin + '/*'] })))
    throw new Error('Allow access to this domain first.');
  const nonce = crypto.randomUUID();
  await browser.storage.session.set({
    [`setup:${tabId}`]: { nonce, origin, expiresAt: Date.now() + 600000 },
  });
  await browser.scripting.executeScript({
    target: { tabId, frameIds: [0] },
    files: ['content.js'],
  });
  await browser.tabs.sendMessage(tabId, { type: 'START_PICKER', nonce }, { frameId: 0 });
  await browser.tabs.update(tabId, { active: true });
}

// All callers serialize these operations with other background state changes.
export async function prepareSiteSetup(
  tabId: number,
  url: string,
  requestId: string,
): Promise<void> {
  const page = new URL(url);
  const tab = await browser.tabs.get(tabId);
  if (page.protocol !== 'https:' || !tab.url || !samePage(tab.url, page.href))
    throw new Error('The watch page changed. Open Malmark on that page and start setup again.');
  await browser.storage.session.set({
    [`setupPending:${tabId}`]: {
      requestId,
      url: page.href,
      origin: page.origin,
      expiresAt: Date.now() + 120000,
    } satisfies PendingSetup,
  });
  // Also covers access already granted, or granted before this intent was stored.
  await resumeSiteSetup(tabId);
}

export async function cancelSiteSetup(tabId: number, requestId: string): Promise<void> {
  const key = `setupPending:${tabId}`;
  const pending = (await browser.storage.session.get(key))[key] as PendingSetup | undefined;
  if (pending?.requestId === requestId) await browser.storage.session.remove(key);
}

async function resumeSiteSetup(tabId: number): Promise<void> {
  const key = `setupPending:${tabId}`;
  const pending = (await browser.storage.session.get(key))[key] as PendingSetup | undefined;
  if (!pending) return;
  const tab = await browser.tabs.get(tabId).catch(() => undefined);
  if (pending.expiresAt <= Date.now() || !tab?.url || !samePage(tab.url, pending.url)) {
    await browser.storage.session.remove(key);
    return;
  }
  if (!(await browser.permissions.contains({ origins: [pending.origin + '/*'] }))) return;
  // Consume before opening so a queued onAdded event cannot restart the picker.
  await browser.storage.session.remove(key);
  await startSiteSetup(tabId);
}

export async function resumeSiteSetups(): Promise<void> {
  const entries = await browser.storage.session.get(null);
  for (const key of Object.keys(entries)) {
    if (!/^setupPending:\d+$/.test(key)) continue;
    await resumeSiteSetup(Number(key.slice('setupPending:'.length))).catch((error) =>
      console.error('Website setup failed:', error),
    );
  }
}
