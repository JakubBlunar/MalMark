import browser from 'webextension-polyfill';
import { MAL_CLIENT_ID, OAUTH_SETUP_REQUIRED } from '../shared/config';
import type {
  Auth,
  Mapping,
  PendingUpdate,
  Settings,
  SiteConfig,
  WatchSession,
} from '../shared/types';

export const defaults: Settings = {
  threshold: 65,
  minWatchSeconds: 60,
  showPrompts: true,
  promptAtEnd: true,
};

export async function getSettings(): Promise<Settings> {
  const { settings } = (await browser.storage.local.get('settings')) as { settings?: Settings };
  // Ignore old per-user OAuth configuration without touching existing login tokens.
  return {
    threshold: settings?.threshold ?? defaults.threshold,
    minWatchSeconds: settings?.minWatchSeconds ?? defaults.minWatchSeconds,
    showPrompts: settings?.showPrompts ?? defaults.showPrompts,
    promptAtEnd: settings?.promptAtEnd ?? defaults.promptAtEnd,
  };
}

export async function getAuth(): Promise<Auth | undefined> {
  return (await browser.storage.local.get('auth')).auth as Auth | undefined;
}

export async function getLoginClientId(): Promise<string> {
  if (!OAUTH_SETUP_REQUIRED) return MAL_CLIENT_ID;
  const { oauthClientId } = await browser.storage.local.get('oauthClientId');
  return typeof oauthClientId === 'string' ? oauthClientId : '';
}

export async function getMappings(): Promise<Mapping[]> {
  return ((await browser.storage.local.get('mappings')).mappings as Mapping[]) ?? [];
}

export async function getSites(): Promise<SiteConfig[]> {
  return ((await browser.storage.local.get('sites')).sites as SiteConfig[]) ?? [];
}

export async function getPending(): Promise<PendingUpdate[]> {
  const entries = ((await browser.storage.local.get('pending')).pending as PendingUpdate[]) ?? [];
  return entries.filter((p) => Date.now() - p.createdAt < 7 * 86400000);
}

export async function getSession(tabId: number): Promise<WatchSession | undefined> {
  return (await browser.storage.session.get(`tab:${tabId}`))[`tab:${tabId}`] as
    WatchSession | undefined;
}

export async function setSession(tabId: number, value: WatchSession): Promise<void> {
  await browser.storage.session.set({ [`tab:${tabId}`]: value });
}

// Serialize state mutations across simultaneous tabs and content-script messages.
let tail = Promise.resolve();
export function serialized<T>(task: () => Promise<T>): Promise<T> {
  const next = tail.then(task, task);
  tail = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
