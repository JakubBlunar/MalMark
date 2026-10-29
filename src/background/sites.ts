import browser from 'webextension-polyfill';
import { siteForUrl } from '../shared/sites';
import type { SiteConfig } from '../shared/types';
import { getSites } from './storage';

export async function configForUrl(url: string): Promise<SiteConfig | undefined> {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return;
    const config = (await getSites()).find((s) => s.origin === u.origin);
    if (config && (await browser.permissions.contains({ origins: [u.origin + '/*'] })))
      return config;
  } catch {
    /* invalid or inaccessible URL */
  }
}

export async function supportedUrl(url: string): Promise<boolean> {
  return !!siteForUrl(url) || !!(await configForUrl(url));
}

export async function retireLegacyAccess(): Promise<void> {
  // Preserve access only when the user explicitly saved their own selector setup.
  const configured = (await getSites()).some((site) => {
    const hostname = new URL(site.origin).hostname;
    return hostname === 'aniwatch.co.at' || hostname.endsWith('.aniwatch.co.at');
  });
  if (!configured) {
    await browser.permissions.remove({
      origins: ['https://aniwatch.co.at/*', 'https://*.aniwatch.co.at/*'],
    });
  }
}

export async function registerSite(config: SiteConfig): Promise<void> {
  const id = 'custom-' + config.id;
  const registered = await browser.scripting.getRegisteredContentScripts({ ids: [id] });
  if (registered.length) await browser.scripting.unregisterContentScripts({ ids: [id] });
  await browser.scripting.registerContentScripts([
    {
      id,
      matches: [config.origin + '/*'],
      js: ['content.js'],
      allFrames: true,
      runAt: 'document_idle',
      persistAcrossSessions: true,
    },
  ]);
}
