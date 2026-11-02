import browser from 'webextension-polyfill';
import type { GuidancePrompt, WatchSession } from '../shared/types';
import { getAuth, getSession, getSettings } from './storage';
import { supportedUrl } from './sites';

interface GuidanceGrant {
  nonce: string;
  prompt: GuidancePrompt;
  pageUrl: string;
  accountId: number;
  parentFrameId: number;
  expiresAt: number;
}

const samePage = (a: string, b: string) => a.split('#')[0] === b.split('#')[0];

export async function guidanceForTab(
  tabId: number,
  session: WatchSession | undefined,
): Promise<GuidancePrompt | undefined> {
  if (!session || !(await getAuth()) || !(await getSettings()).showPrompts) return;
  const dismissed = ((await browser.storage.session.get(`guidanceDismissed:${tabId}`))[
    `guidanceDismissed:${tabId}`
  ] || []) as string[];
  const connected = !!session.progress.last && Date.now() - session.progress.last.sentAt < 15000;
  if (!connected && session.frameOrigins.length) {
    const frames = await browser.webNavigation.getAllFrames({ tabId });
    const liveOrigins = new Set(
      (frames || []).flatMap((frame) => {
        try {
          return [new URL(frame.url).origin];
        } catch {
          return [];
        }
      }),
    );
    const origins = (
      await Promise.all(
        session.frameOrigins.map(async (origin) =>
          liveOrigins.has(origin) &&
          !dismissed.includes(`player:${origin}`) &&
          !(await browser.permissions.contains({ origins: [origin + '/*'] }))
            ? origin
            : undefined,
        ),
      )
    )
      .filter((origin): origin is string => !!origin)
      .sort();
    if (origins.length)
      return {
        kind: 'player',
        id: `player:${origins.join('|')}`,
        title: session.detection.title,
        tabId,
        origins,
      };
  }
  const id = `match:${session.detection.seriesKey}`;
  if (session.match === 'unmatched' && !dismissed.includes(id))
    return { kind: 'unmatched', id, title: session.detection.title, tabId };
}

export async function guidancePromptNonce(
  prompt: GuidancePrompt,
  pageUrl: string,
  parentFrameId: number,
): Promise<string> {
  const auth = await getAuth();
  if (!auth?.profile) throw new Error('Sign in to MyAnimeList first.');
  const key = `guidancePrompt:${prompt.tabId}`;
  const stored = (await browser.storage.session.get(key))[key];
  const grants: GuidanceGrant[] = Array.isArray(stored)
    ? stored.filter((grant) => grant.expiresAt > Date.now())
    : [];
  const previous = grants.find((grant) => grant.parentFrameId === parentFrameId);
  if (
    previous?.prompt.id === prompt.id &&
    samePage(previous.pageUrl, pageUrl) &&
    previous.accountId === auth.profile.id
  )
    return previous.nonce;
  const grant: GuidanceGrant = {
    nonce: crypto.randomUUID(),
    prompt,
    pageUrl,
    parentFrameId,
    accountId: auth.profile.id,
    expiresAt: Date.now() + 10 * 60000,
  };
  await browser.storage.session.set({
    [key]: [...grants.filter((grant) => grant.parentFrameId !== parentFrameId), grant].slice(-32),
  });
  return grant.nonce;
}

export async function guidancePromptContext(nonce: string, sender: browser.Runtime.MessageSender) {
  const tabId = sender.tab?.id;
  if (
    typeof nonce !== 'string' ||
    tabId === undefined ||
    !sender.frameId ||
    sender.url !== browser.runtime.getURL(`prompt.html#${nonce}`)
  )
    throw new Error('This prompt is only available inside Malmark.');
  const stored = (await browser.storage.session.get(`guidancePrompt:${tabId}`))[
    `guidancePrompt:${tabId}`
  ];
  const grant: GuidanceGrant | undefined = Array.isArray(stored)
    ? stored.find((grant) => grant.nonce === nonce)
    : undefined;
  const tab = await browser.tabs.get(tabId);
  const session = await getSession(tabId);
  const auth = await getAuth();
  if (
    !grant ||
    grant.expiresAt <= Date.now() ||
    !tab.url ||
    !samePage(tab.url, grant.pageUrl) ||
    !session ||
    !samePage(session.detection.url, tab.url) ||
    auth?.profile?.id !== grant.accountId ||
    !(await getSettings()).showPrompts ||
    !(await supportedUrl(tab.url)) ||
    (grant.prompt.kind === 'unmatched' && session.match !== 'unmatched')
  )
    throw new Error('This prompt expired. Open Malmark on the current watch page.');
  return { ...grant, tabId, session };
}

export async function dismissGuidance(prompt: GuidancePrompt): Promise<void> {
  const key = `guidanceDismissed:${prompt.tabId}`;
  const dismissed = ((await browser.storage.session.get(key))[key] || []) as string[];
  const ids =
    prompt.kind === 'player' ? prompt.origins.map((origin) => `player:${origin}`) : [prompt.id];
  await browser.storage.session.set({ [key]: [...new Set([...dismissed, ...ids])].slice(-100) });
  await browser.storage.session.remove(`guidancePrompt:${prompt.tabId}`);
  await browser.tabs.sendMessage(prompt.tabId, { type: 'PROMPT_CHANGED' }).catch(() => undefined);
}
