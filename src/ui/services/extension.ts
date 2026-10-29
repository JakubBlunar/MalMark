import type Browser from 'webextension-polyfill';
import type { Message, Reply } from '../../shared/types';
import { chromiumSidePanel } from '../../shared/sidebar';

export const inExtension = !!(globalThis as { chrome?: { runtime?: { id?: string } } }).chrome
  ?.runtime?.id;

const browser = inExtension
  ? (await import('webextension-polyfill')).default
  : ({} as typeof Browser);

export async function request<T = void>(message: Message): Promise<T> {
  let response: Reply<T>;
  try {
    response = (await browser.runtime.sendMessage(message)) as Reply<T>;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (
      /receiving end does not exist|could not establish connection|extension context invalidated/i.test(
        detail,
      )
    ) {
      throw new Error(
        'Malmark could not reach its background script. Reload the extension on your browser’s extensions page, then reopen Malmark.',
      );
    }
    throw error;
  }
  if (!response?.ok)
    throw new Error(response?.error || 'The extension did not respond. Reload it and try again.');
  return response.data;
}

export async function activeTabId(): Promise<number | undefined> {
  const sidebar = location.pathname.endsWith('sidebar.html');
  const param = new URLSearchParams(location.search).get('tab');
  if (!sidebar && param && /^\d+$/.test(param)) return Number(param);
  const active = (await browser.tabs.query({ active: true, currentWindow: true }))[0];
  if (!sidebar && active?.url?.startsWith(browser.runtime.getURL(''))) {
    const state = await request<{ sites: { origin: string }[] }>({ type: 'GET_STATE' });
    const tabs = await browser.tabs.query({
      url: [
        'https://*.crunchyroll.com/*',
        'https://crunchyroll.com/*',
        ...state.sites.map((s) => s.origin + '/*'),
      ],
    });
    return tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0]?.id;
  }
  return active?.id;
}

export async function grantPlayer(origin: string, tabId: number): Promise<void> {
  // The permission request stays directly in the user's click handler.
  const granted = await browser.permissions.request({ origins: [origin + '/*'] });
  if (!granted)
    throw new Error('Player access was not granted. You can try again whenever you want.');
  await request({ type: 'INJECT_PLAYERS', tabId });
}

export async function revokePlayer(origin: string): Promise<void> {
  await browser.permissions.remove({ origins: [origin] });
}

export async function setupWebsite(url: string, tabId: number): Promise<void> {
  const origin = new URL(url).origin;
  const granted = await browser.permissions.request({ origins: [origin + '/*'] });
  if (!granted) throw new Error('Website access was not granted. No selectors were saved.');
  await request({ type: 'START_SETUP', tabId });
  if (location.pathname.endsWith('popup.html')) window.close();
}

export async function openSettings(): Promise<void> {
  await browser.runtime.openOptionsPage();
}

export function openSidebar(tabId?: number): Promise<void> {
  // Call the native API before awaiting anything, preserving the click's user gesture.
  if (browser.sidebarAction?.open) return browser.sidebarAction.open();
  const panel = chromiumSidePanel();
  if (panel?.open && tabId !== undefined) return panel.open({ tabId });
  return Promise.reject(
    new Error(
      'The sidebar is unavailable. Open Malmark from the browser’s sidebar menu, or use the popup.',
    ),
  );
}

export function onActiveTabChange(callback: () => void): () => void {
  const updated = (_id: number, change: Browser.Tabs.OnUpdatedChangeInfoType) => {
    if (change.url || change.status === 'complete') callback();
  };
  browser.tabs.onActivated.addListener(callback);
  browser.tabs.onUpdated.addListener(updated);
  return () => {
    browser.tabs.onActivated.removeListener(callback);
    browser.tabs.onUpdated.removeListener(updated);
  };
}
export function onReviewRequest(callback: (tabId: number) => void): () => void {
  const listener = (message: unknown, sender: Browser.Runtime.MessageSender) => {
    if (sender.id !== browser.runtime.id || sender.tab || !message || typeof message !== 'object')
      return;
    if (
      'type' in message &&
      message.type === 'REVIEW_UPDATES' &&
      'tabId' in message &&
      typeof message.tabId === 'number'
    )
      callback(message.tabId);
  };
  browser.runtime.onMessage.addListener(listener);
  return () => browser.runtime.onMessage.removeListener(listener);
}
