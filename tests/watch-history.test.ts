import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WatchSession } from '../src/shared/types';
import { accumulate, emptyProgress } from '../src/shared/progress';

const mock = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: async (key: string) => structuredClone({ [key]: mock.data[key] }),
        set: async (values: Record<string, unknown>) =>
          Object.assign(mock.data, structuredClone(values)),
      },
    },
  },
}));
import {
  clearWatchedProgress,
  discardWatchProgress,
  HISTORY_LIMIT,
  HISTORY_TTL,
  pruneWatchHistory,
  removeSiteProgress,
  restoreWatchProgress,
  saveWatchProgress,
} from '../src/background/watch-history';

function session(episode = 2): WatchSession {
  return {
    detection: {
      site: 'crunchyroll',
      url: 'https://www.crunchyroll.com/watch/EP/episode',
      seriesKey: 'crunchyroll:SHOW:s1',
      title: 'A Show',
      episode,
      season: 1,
    },
    anime: {
      id: 11,
      title: 'A Show',
      my_list_status: { status: 'watching', num_episodes_watched: 1 },
    },
    episode,
    match: 'matched',
    frameOrigins: [],
    playerConnected: true,
    updatedAt: Date.now(),
    progress: {
      ranges: [[0, 100]],
      watched: 100,
      duration: 1000,
      position: 100,
      frameId: 7,
      last: {
        videoId: 'old-player',
        currentTime: 100,
        duration: 1000,
        rate: 1,
        sentAt: Date.now(),
        paused: false,
        ended: false,
      },
    },
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-29T10:00:00Z'));
  mock.data = { auth: { profile: { id: 5 } } };
});
afterEach(() => vi.useRealTimers());

describe('durable episode progress', () => {
  it('restores ranges across a new tab and URL without carrying a live player or offline time', async () => {
    await saveWatchProgress(session());
    vi.setSystemTime(Date.now() + 86400000);
    const resumed = session();
    resumed.detection.url = 'https://www.crunchyroll.com/watch/EP/episode?autoplay=true';
    const progress = await restoreWatchProgress(resumed);
    expect(progress).toEqual({ ranges: [[0, 100]], watched: 100, duration: 1000, position: 100 });
    const sample = {
      ...resumed.progress.last!,
      videoId: 'new-player',
      currentTime: 700,
      sentAt: Date.now(),
    };
    const first = accumulate(progress, sample, 0);
    expect(first.watched).toBe(100);
    expect(
      accumulate(first, { ...sample, currentTime: 705, sentAt: Date.now() + 5000 }, 0).watched,
    ).toBe(105);
  });
  it('keeps accounts, domains, seasons, MAL matches and episodes separate', async () => {
    await saveWatchProgress(session());
    for (const mutate of [
      (s: WatchSession) => {
        s.episode = 3;
      },
      (s: WatchSession) => {
        s.detection.season = 2;
      },
      (s: WatchSession) => {
        s.detection.seriesKey = 'another-series';
      },
      (s: WatchSession) => {
        s.detection.url = 'https://another.example/watch';
      },
      (s: WatchSession) => {
        s.anime!.id = 22;
      },
    ]) {
      const other = session();
      mutate(other);
      expect(await restoreWatchProgress(other)).toEqual(emptyProgress());
    }
    mock.data.auth = { profile: { id: 6 } };
    expect(await restoreWatchProgress(session())).toEqual(emptyProgress());
  });
  it('unions simultaneous tab checkpoints without counting replayed sections twice', async () => {
    await saveWatchProgress(session());
    const next = session();
    next.progress.ranges = [
      [90, 200],
      [500, 510],
    ];
    await saveWatchProgress(next);
    expect((await restoreWatchProgress(next)).ranges).toEqual([
      [0, 200],
      [500, 510],
    ]);
    expect((await restoreWatchProgress(next)).watched).toBe(210);
  });
  it('does not restore different-duration media or keep already logged episodes', async () => {
    await saveWatchProgress(session());
    const next = session();
    next.progress = { ranges: [], watched: 0, position: 0, duration: 1200 };
    await saveWatchProgress(next);
    expect((await restoreWatchProgress(next)).watched).toBe(0);
    await saveWatchProgress(session());
    await clearWatchedProgress(11, 2);
    expect(mock.data.watchHistory).toEqual([]);
    next.anime!.my_list_status!.num_episodes_watched = 2;
    await saveWatchProgress(next);
    expect(mock.data.watchHistory).toEqual([]);
  });
  it('discards corrected matches and removed website history', async () => {
    await saveWatchProgress(session());
    await discardWatchProgress(session());
    expect(await restoreWatchProgress(session())).toEqual(emptyProgress());
    await saveWatchProgress(session());
    await removeSiteProgress('https://www.crunchyroll.com');
    expect(mock.data.watchHistory).toEqual([]);
  });
  it('physically expires old records and caps the number of retained episodes', async () => {
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      vi.setSystemTime(Date.now() + 1);
      await saveWatchProgress(session(i + 2));
    }
    expect(mock.data.watchHistory).toHaveLength(HISTORY_LIMIT);
    expect(await restoreWatchProgress(session(2))).toEqual(emptyProgress());
    expect((await restoreWatchProgress(session(HISTORY_LIMIT + 6))).watched).toBe(100);
    vi.setSystemTime(Date.now() + HISTORY_TTL + 1);
    await pruneWatchHistory();
    expect(mock.data.watchHistory).toEqual([]);
  });
  it('rejects malformed checkpoints and bounds fragmented timeline storage', async () => {
    const next = session();
    next.progress.ranges = Array.from({ length: 400 }, (_, i) => [i * 2, i * 2 + 1]);
    await saveWatchProgress(next);
    expect((await restoreWatchProgress(next)).ranges.length).toBeLessThanOrEqual(256);
    const valid = (mock.data.watchHistory as unknown[])[0];
    mock.data.watchHistory = [
      null,
      { key: 'broken' },
      { ...(valid as object), progress: { duration: 1000, position: 10, ranges: [null] } },
      valid,
    ];
    await pruneWatchHistory();
    expect(mock.data.watchHistory).toHaveLength(1);
  });
});
