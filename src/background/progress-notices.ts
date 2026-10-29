import browser from 'webextension-polyfill';
import type { ProgressNotice } from '../shared/types';

export async function showProgressNotice(
  tabId: number,
  id: string,
  title: string,
  episode: number,
): Promise<void> {
  const notice: ProgressNotice = { id, title, episode, expiresAt: Date.now() + 4000 };
  await browser.storage.session.set({ [`notice:${tabId}`]: notice });
}

export async function getProgressNotice(
  tabId: number,
  account?: number,
): Promise<ProgressNotice | undefined> {
  const key = `notice:${tabId}`;
  const notice = (await browser.storage.session.get(key))[key] as ProgressNotice | undefined;
  if (
    notice &&
    account !== undefined &&
    notice.id.startsWith(`${account}:`) &&
    notice.expiresAt > Date.now()
  )
    return notice;
  if (notice) await browser.storage.session.remove(key);
}
