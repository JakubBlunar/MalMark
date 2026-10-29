import { describe, expect, it } from 'vitest';
import { accumulate, addRange, emptyProgress, isComplete } from '../src/shared/progress';
import type { Playback, Settings } from '../src/shared/types';
const settings: Settings = {
  autoProgress: false,
  autoFinishDate: false,
  threshold: 90,
  minWatchSeconds: 60,
  showPrompts: true,
  promptAtEnd: false,
};
const sample = (time: number, sentAt: number, extra: Partial<Playback> = {}): Playback => ({
  videoId: 'v1',
  currentTime: time,
  duration: 1000,
  sentAt,
  paused: false,
  ended: false,
  rate: 1,
  ...extra,
});
describe('watched time tracking', () => {
  it('merges ranges without double-counting replays', () =>
    expect(
      addRange(
        [
          [0, 10],
          [20, 30],
        ],
        5,
        25,
      ),
    ).toEqual([[0, 30]]));
  it('credits continuous playback', () => {
    const p = accumulate(accumulate(emptyProgress(), sample(0, 0), 0), sample(5, 5000), 0);
    expect(p.watched).toBe(5);
  });
  it('does not credit a seek to the credits', () => {
    const p = accumulate(
      accumulate(emptyProgress(), sample(0, 0), 0),
      sample(990, 5000, { ended: true }),
      0,
    );
    expect(p.watched).toBe(0);
    expect(isComplete(p, settings)).toBe(false);
  });
  it('ignores a resumed browser after a long sleep', () => {
    const p = accumulate(accumulate(emptyProgress(), sample(0, 0), 0), sample(500, 600000), 0);
    expect(p.watched).toBe(0);
  });
  it('does not count paused time', () => {
    const p = accumulate(
      accumulate(emptyProgress(), sample(1, 0, { paused: true }), 0),
      sample(6, 5000),
      0,
    );
    expect(p.watched).toBe(0);
  });
  it('counts playback at 2x speed', () => {
    const p = accumulate(
      accumulate(emptyProgress(), sample(0, 0, { rate: 2 }), 0),
      sample(10, 5000, { rate: 2 }),
      0,
    );
    expect(p.watched).toBe(10);
  });
  it('does not combine unrelated players', () => {
    const p = accumulate(accumulate(emptyProgress(), sample(0, 0), 0), sample(5, 5000), 1);
    expect(p.frameId).toBe(0);
    expect(p.watched).toBe(0);
  });
  it('retains watched ranges when a replacement frame resumes the same episode', () => {
    let p = accumulate(accumulate(emptyProgress(), sample(0, 0), 0), sample(5, 5000), 0);
    p = accumulate(p, sample(20, 25000), 2);
    expect(p.frameId).toBe(2);
    expect(p.watched).toBe(5);
    p = accumulate(p, sample(25, 30000), 2);
    expect(p.ranges).toEqual([
      [0, 5],
      [20, 25],
    ]);
    expect(p.watched).toBe(10);
  });
  it('allows a new frame immediately after the previous player ends without crediting the jump', () => {
    let p = accumulate(emptyProgress(), sample(990, 0), 0);
    p = accumulate(p, sample(995, 5000, { ended: true }), 0);
    p = accumulate(p, sample(100, 6000, { videoId: 'replacement' }), 2);
    expect(p.frameId).toBe(2);
    expect(p.watched).toBe(5);
    expect(p.position).toBe(100);
  });
  it('allows a replacement player without crediting its jump', () => {
    const p = accumulate(
      accumulate(emptyProgress(), sample(0, 0), 0),
      sample(500, 5000, { videoId: 'v2' }),
      0,
    );
    expect(p.watched).toBe(0);
  });
  it('resets ranges when a different-duration video replaces an ad', () => {
    let p = accumulate(
      accumulate(emptyProgress(), sample(0, 0, { duration: 100 }), 0),
      sample(5, 5000, { duration: 100 }),
      0,
    );
    p = accumulate(p, sample(10, 10000, { duration: 1000 }), 0);
    expect(p.watched).toBe(0);
  });
  it.each([NaN, Infinity, -1])('rejects invalid playback time %s', (time) =>
    expect(accumulate(emptyProgress(), sample(time, 0), 0)).toEqual(emptyProgress()),
  );
  it('requires both watched coverage and playback position to reach threshold', () => {
    expect(
      isComplete({ ...emptyProgress(), duration: 1000, watched: 900, position: 900 }, settings),
    ).toBe(true);
    expect(
      isComplete({ ...emptyProgress(), duration: 1000, watched: 50, position: 999 }, settings),
    ).toBe(false);
    expect(
      isComplete({ ...emptyProgress(), duration: 1000, watched: 900, position: 10 }, settings),
    ).toBe(false);
  });
  it('honors the configured minimum duration', () =>
    expect(
      isComplete(
        { ...emptyProgress(), duration: 100, watched: 90, position: 90 },
        { ...settings, minWatchSeconds: 100 },
      ),
    ).toBe(false));
  it('reminds near the end after skipped recaps, opening and credits', () => {
    const p = { ...emptyProgress(), duration: 1420, watched: 999, position: 1370 };
    expect(isComplete(p, { ...settings, threshold: 80 })).toBe(false);
    expect(isComplete(p, { ...settings, threshold: 80, promptAtEnd: true })).toBe(true);
    expect(isComplete({ ...p, position: 1300 }, { ...settings, promptAtEnd: true })).toBe(false);
    expect(isComplete({ ...p, watched: 700 }, { ...settings, promptAtEnd: true })).toBe(false);
  });
  it('supports a 65% threshold without crediting skipped segments', () => {
    const p = { ...emptyProgress(), duration: 1420, watched: 999, position: 1200 };
    expect(isComplete(p, { ...settings, threshold: 65 })).toBe(true);
    expect(isComplete(p, { ...settings, threshold: 80 })).toBe(false);
  });
});
