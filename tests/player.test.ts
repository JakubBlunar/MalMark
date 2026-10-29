import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlayerTracker } from '../src/content/player';

function video(parent: HTMLElement | ShadowRoot = document.body) {
  const element = document.createElement('video');
  Object.defineProperties(element, {
    duration: { value: 1000, configurable: true },
    currentTime: { value: 5, configurable: true },
    paused: { value: false, configurable: true },
  });
  element.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect;
  parent.append(element);
  return element;
}
beforeEach(() => {
  vi.useFakeTimers();
  document.body.replaceChildren();
});
afterEach(() => vi.useRealTimers());
describe('player discovery and heartbeats', () => {
  it('finds a late player and keeps reporting even without timeupdate events', () => {
    const report = vi.fn();
    const tracker = createPlayerTracker(report);
    tracker.scan();
    expect(report).not.toHaveBeenCalled();
    const player = video();
    tracker.scan();
    expect(report).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    Object.defineProperty(player, 'currentTime', { value: 10 });
    tracker.scan();
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ currentTime: 10 }));
    tracker.stop();
  });
  it('discovers unknown and nested open shadow roots and binds pause/rate/metadata events', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    const nested = document.createElement('section');
    root.append(nested);
    const player = video(nested.attachShadow({ mode: 'open' }));
    const report = vi.fn();
    const tracker = createPlayerTracker(report);
    tracker.scan();
    for (const event of ['pause', 'ratechange', 'loadedmetadata'])
      player.dispatchEvent(new Event(event));
    expect(report).toHaveBeenCalledTimes(4);
    tracker.stop();
    player.dispatchEvent(new Event('pause'));
    expect(report).toHaveBeenCalledTimes(4);
  });
  it('replaces hidden or detached players while ignoring short ads and invisible preloads', () => {
    const first = video();
    const report = vi.fn();
    const tracker = createPlayerTracker(report);
    tracker.scan();
    const firstId = report.mock.calls[0][0].videoId;
    first.style.visibility = 'hidden';
    const replacement = video();
    tracker.scan();
    expect(report.mock.calls.at(-1)![0].videoId).not.toBe(firstId);
    replacement.remove();
    const ad = video();
    Object.defineProperty(ad, 'duration', { value: 30 });
    vi.advanceTimersByTime(5000);
    tracker.scan();
    expect(report).toHaveBeenCalledTimes(2);
    const resumed = video();
    tracker.scan();
    expect(report).toHaveBeenCalledTimes(3);
    Object.defineProperty(resumed, 'paused', { value: true });
    vi.advanceTimersByTime(5000);
    tracker.scan();
    expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ paused: true }));
    tracker.stop();
  });
});
