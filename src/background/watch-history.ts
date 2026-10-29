import browser from 'webextension-polyfill';
import { addRange, emptyProgress } from '../shared/progress';
import type { WatchProgress, WatchSession } from '../shared/types';
import { getAuth } from './storage';

export const HISTORY_TTL = 30 * 86400000;
export const HISTORY_LIMIT = 100;
const RANGE_LIMIT = 256;
interface Checkpoint {
  key: string;
  account: number;
  animeId: number;
  episode: number;
  origin: string;
  updatedAt: number;
  progress: WatchProgress;
}

function identity(session: WatchSession, account: number): string | undefined {
  if (!session.anime || !session.episode) return;
  return JSON.stringify([
    account,
    new URL(session.detection.url).origin,
    session.detection.seriesKey,
    session.detection.season,
    session.anime.id,
    session.episode,
  ]);
}

function compact(progress: WatchProgress): WatchProgress | undefined {
  if (
    !Number.isFinite(progress.duration) ||
    progress.duration < 60 ||
    !Number.isFinite(progress.position) ||
    progress.position < 0
  )
    return;
  const ranges = progress.ranges
    .filter(
      ([start, end]) =>
        Number.isFinite(start) &&
        Number.isFinite(end) &&
        start >= 0 &&
        end > start &&
        end <= progress.duration + 2,
    )
    .reduce(
      (merged, [start, end]) => addRange(merged, start, Math.min(end, progress.duration)),
      [] as [number, number][],
    )
    .sort((a, b) => b[1] - b[0] - (a[1] - a[0]))
    .slice(0, RANGE_LIMIT)
    .sort((a, b) => a[0] - b[0]);
  return {
    ranges,
    watched: ranges.reduce((sum, [start, end]) => sum + end - start, 0),
    duration: progress.duration,
    position: Math.min(progress.position, progress.duration),
  };
}

async function history(): Promise<Checkpoint[]> {
  const { watchHistory } = await browser.storage.local.get('watchHistory');
  const entries = Array.isArray(watchHistory) ? watchHistory : [];
  const retained: Checkpoint[] = entries
    .flatMap((entry: Checkpoint) => {
      if (
        !entry ||
        typeof entry.key !== 'string' ||
        typeof entry.origin !== 'string' ||
        !Number.isInteger(entry.account) ||
        !Number.isInteger(entry.animeId) ||
        !Number.isInteger(entry.episode) ||
        !Number.isFinite(entry.updatedAt) ||
        entry.updatedAt <= Date.now() - HISTORY_TTL ||
        entry.updatedAt > Date.now() ||
        !entry.progress ||
        !Array.isArray(entry.progress.ranges) ||
        !entry.progress.ranges.every((range) => Array.isArray(range) && range.length === 2)
      )
        return [];
      const progress = compact(entry.progress);
      return progress ? [{ ...entry, progress }] : [];
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, HISTORY_LIMIT);
  if (JSON.stringify(entries) !== JSON.stringify(retained))
    await browser.storage.local.set({ watchHistory: retained });
  return retained;
}

export async function pruneWatchHistory(): Promise<void> {
  await history();
}

export async function restoreWatchProgress(session: WatchSession): Promise<WatchProgress> {
  const entries = await history();
  const account = (await getAuth())?.profile?.id;
  if (account === undefined) return emptyProgress();
  const key = identity(session, account);
  const checkpoint = key && entries.find((entry) => entry.key === key);
  // A live frame and its previous sample never survive a browser restart.
  return checkpoint ? checkpoint.progress : emptyProgress();
}

export async function saveWatchProgress(session: WatchSession): Promise<void> {
  const account = (await getAuth())?.profile?.id;
  if (account === undefined) return;
  const key = identity(session, account);
  if (!key || !session.anime || !session.episode) return;
  let progress = compact(session.progress);
  if (!progress) return;
  const entries = await history();
  const previous = entries.find((entry) => entry.key === key);
  const remaining = entries.filter((entry) => entry.key !== key);
  // Local playback coverage is independent of the episode total already logged on MAL.
  if (previous && Math.abs(previous.progress.duration - progress.duration) < 3) {
    progress = compact({ ...progress, ranges: [...previous.progress.ranges, ...progress.ranges] })!;
    session.progress = { ...session.progress, ...progress };
  }
  await browser.storage.local.set({
    watchHistory: [
      {
        key,
        account,
        animeId: session.anime.id,
        episode: session.episode,
        origin: new URL(session.detection.url).origin,
        updatedAt: Date.now(),
        progress,
      },
      ...remaining,
    ].slice(0, HISTORY_LIMIT),
  });
}

export async function discardWatchProgress(session: WatchSession): Promise<void> {
  const account = (await getAuth())?.profile?.id;
  if (account === undefined) return;
  const key = identity(session, account);
  const entries = await history();
  await browser.storage.local.set({ watchHistory: entries.filter((entry) => entry.key !== key) });
}

export async function removeSiteProgress(origin: string): Promise<void> {
  await browser.storage.local.set({
    watchHistory: (await history()).filter((entry) => entry.origin !== origin),
  });
}
