import browser from 'webextension-polyfill';
import type { PendingUpdate } from '../shared/types';
import { getAuth, getPending, getSettings } from './storage';
import { supportedUrl } from './sites';

interface PromptGrant {
  nonce: string;
  itemId: string;
  origin: string;
  expiresAt: number;
  parentFrameId: number;
}

export async function inlinePromptNonce(
  tabId: number,
  url: string,
  item: PendingUpdate,
  parentFrameId: number,
): Promise<string> {
  const key = `inlinePrompt:${tabId}`;
  const stored = (await browser.storage.session.get(key))[key];
  const grants: PromptGrant[] = Array.isArray(stored)
    ? stored.filter((g) => g.expiresAt > Date.now())
    : [];
  const previous = grants.find((g) => g.parentFrameId === parentFrameId);
  const origin = new URL(url).origin;
  if (previous?.itemId === item.id && previous.origin === origin && previous.expiresAt > Date.now())
    return previous.nonce;
  const grant: PromptGrant = {
    nonce: crypto.randomUUID(),
    itemId: item.id,
    origin,
    expiresAt: Date.now() + 10 * 60000,
    parentFrameId,
  };
  await browser.storage.session.set({
    [key]: [...grants.filter((g) => g.parentFrameId !== parentFrameId), grant].slice(-32),
  });
  return grant.nonce;
}

// Only the packaged extension frame can use the grant. Streaming-page messages cannot approve updates.
export async function inlinePromptContext(
  nonce: string,
  sender: browser.Runtime.MessageSender,
): Promise<{ item: PendingUpdate; parentFrameId: number }> {
  const tabId = sender.tab?.id;
  if (
    typeof nonce !== 'string' ||
    tabId === undefined ||
    !sender.frameId ||
    sender.url !== browser.runtime.getURL(`prompt.html#${nonce}`)
  )
    throw new Error('This reminder is only available inside Malmark.');
  const key = `inlinePrompt:${tabId}`;
  const stored = (await browser.storage.session.get(key))[key];
  const grant: PromptGrant | undefined = Array.isArray(stored)
    ? stored.find((g) => g.nonce === nonce)
    : undefined;
  const tab = await browser.tabs.get(tabId);
  const auth = await getAuth();
  if (
    !grant ||
    grant.nonce !== nonce ||
    grant.expiresAt <= Date.now() ||
    !tab.url ||
    new URL(tab.url).origin !== grant.origin ||
    !(await supportedUrl(tab.url)) ||
    !(await getSettings()).showPrompts ||
    !auth?.profile
  )
    throw new Error('This reminder expired. Review your queued updates in Malmark.');
  const item = (await getPending()).find(
    (p) =>
      p.id === grant.itemId &&
      p.tabId === tabId &&
      !p.deferred &&
      p.id.startsWith(`${auth.profile!.id}:`),
  );
  if (!item) throw new Error('This episode update is no longer pending.');
  return { item, parentFrameId: grant.parentFrameId };
}
