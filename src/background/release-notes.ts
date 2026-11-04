import browser from 'webextension-polyfill';
import { compareVersions, version } from '../shared/releases';

const validVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);

export async function initializeReleaseNotes(details?: {
  reason: string;
  previousVersion?: string;
}): Promise<void> {
  const { releaseNotesSeenVersion } = await browser.storage.local.get('releaseNotesSeenVersion');
  if (validVersion(releaseNotesSeenVersion)) return;
  const baseline =
    details?.reason === 'update' && validVersion(details.previousVersion)
      ? details.previousVersion
      : version;
  await browser.storage.local.set({ releaseNotesSeenVersion: baseline });
}

export async function unreadReleaseNotes(): Promise<boolean> {
  const { releaseNotesSeenVersion } = await browser.storage.local.get('releaseNotesSeenVersion');
  return (
    validVersion(releaseNotesSeenVersion) && compareVersions(releaseNotesSeenVersion, version) < 0
  );
}

export async function markReleaseNotesRead(): Promise<void> {
  await browser.storage.local.set({ releaseNotesSeenVersion: version });
}
