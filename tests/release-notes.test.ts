import { beforeEach, describe, expect, it, vi } from 'vitest';
import { compareVersions, version } from '../src/shared/releases';
import { installedReleases } from '../src/ui/lib/release-history';

const storage = vi.hoisted(() => {
  const values: Record<string, unknown> = {};
  return {
    values,
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (update: Record<string, unknown>) => {
      Object.assign(values, update);
    }),
  };
});
vi.mock('webextension-polyfill', () => ({ default: { storage: { local: storage } } }));
import {
  initializeReleaseNotes,
  markReleaseNotesRead,
  unreadReleaseNotes,
} from '../src/background/release-notes';

beforeEach(() => {
  for (const key of Object.keys(storage.values)) delete storage.values[key];
  vi.clearAllMocks();
});

describe('release awareness', () => {
  it('does not label a fresh installation as an update', async () => {
    await initializeReleaseNotes({ reason: 'install' });
    expect(await unreadReleaseNotes()).toBe(false);
    expect(storage.values.releaseNotesSeenVersion).toBe(version);
  });
  it('highlights upgrades from installations that did not track read notes', async () => {
    await initializeReleaseNotes({ reason: 'update', previousVersion: '0.1.1' });
    expect(await unreadReleaseNotes()).toBe(true);
    await initializeReleaseNotes({ reason: 'update', previousVersion: version });
    expect(await unreadReleaseNotes()).toBe(true);
  });
  it('only clears an update when its notes are read and keeps that choice on reload', async () => {
    storage.values.releaseNotesSeenVersion = '0.1.1';
    expect(await unreadReleaseNotes()).toBe(true);
    expect(storage.values.releaseNotesSeenVersion).toBe('0.1.1');
    await markReleaseNotesRead();
    await initializeReleaseNotes({ reason: 'update', previousVersion: '0.1.1' });
    expect(await unreadReleaseNotes()).toBe(false);
  });
  it('handles skipped versions, numeric versions, and downgrades', async () => {
    expect(compareVersions('0.10.0', '0.2.9')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '0.99.99')).toBeGreaterThan(0);
    storage.values.releaseNotesSeenVersion = '0.0.1';
    expect(await unreadReleaseNotes()).toBe(true);
    storage.values.releaseNotesSeenVersion = '9.0.0';
    expect(await unreadReleaseNotes()).toBe(false);
    expect(installedReleases[0].version).toBe(version);
    expect(installedReleases.length).toBeLessThanOrEqual(4);
  });
  it('does not turn a browser update, malformed data, or a same-version reload into a release', async () => {
    storage.values.releaseNotesSeenVersion = { invalid: true };
    await initializeReleaseNotes({ reason: 'browser_update' });
    expect(await unreadReleaseNotes()).toBe(false);
    delete storage.values.releaseNotesSeenVersion;
    await initializeReleaseNotes({ reason: 'update', previousVersion: version });
    expect(await unreadReleaseNotes()).toBe(false);
  });
});
