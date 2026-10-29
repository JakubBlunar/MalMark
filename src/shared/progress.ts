import type { Playback, Settings, WatchProgress } from './types';

export const emptyProgress = (): WatchProgress => ({
  ranges: [],
  watched: 0,
  duration: 0,
  position: 0,
});

export function addRange(
  ranges: [number, number][],
  start: number,
  end: number,
): [number, number][] {
  const sorted = [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last && range[0] <= last[1] + 0.5) last[1] = Math.max(last[1], range[1]);
    else result.push([...range]);
  }
  return result;
}

export function accumulate(
  progress: WatchProgress,
  sample: Playback,
  frameId: number,
): WatchProgress {
  if (
    ![sample.currentTime, sample.duration, sample.sentAt, sample.rate].every(Number.isFinite) ||
    sample.duration < 60 ||
    sample.currentTime < 0 ||
    sample.currentTime > sample.duration + 2 ||
    sample.rate <= 0 ||
    sample.rate > 4
  )
    return progress;
  // A second player/ad cannot contribute time to the episode's main player.
  const frameChanged = progress.frameId !== undefined && progress.frameId !== frameId;
  if (
    frameChanged &&
    !progress.last?.paused &&
    sample.sentAt - (progress.last?.sentAt ?? 0) < 15000
  )
    return progress;
  const previous = progress.last;
  let ranges = progress.ranges;
  const sameVideo = previous?.videoId === sample.videoId && progress.frameId === frameId;
  const sameDuration = Math.abs(progress.duration - sample.duration) < 3;
  if ((!sameDuration && progress.duration > 0) || frameChanged) ranges = [];
  if (previous && sameVideo && sameDuration && !previous.paused) {
    const elapsed = (sample.sentAt - previous.sentAt) / 1000;
    const advance = sample.currentTime - previous.currentTime;
    // Count only contiguous playback. Seeking and long gaps earn no credit.
    if (
      elapsed > 0 &&
      elapsed <= 20 &&
      advance > 0 &&
      advance <= elapsed * Math.max(previous.rate, sample.rate) + 1.5
    ) {
      ranges = addRange(ranges, previous.currentTime, sample.currentTime);
    }
  }
  return {
    ranges,
    watched: ranges.reduce((sum, [s, e]) => sum + e - s, 0),
    duration: sample.duration,
    position: sample.currentTime,
    last: sample,
    frameId,
  };
}

export function isComplete(p: WatchProgress, settings: Settings): boolean {
  if (p.duration < 60 || p.watched < Math.min(settings.minWatchSeconds, p.duration)) return false;
  const watched = p.watched / p.duration;
  const position = p.position / p.duration;
  const thresholdReached =
    watched >= settings.threshold / 100 && position >= settings.threshold / 100;
  // A reminder can tolerate skipped recaps/credits, but a seek alone never earns watch credit.
  const nearEnd = settings.promptAtEnd && watched >= 0.5 && position >= 0.95;
  return thresholdReached || nearEnd;
}
