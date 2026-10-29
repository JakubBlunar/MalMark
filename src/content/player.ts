import type { Playback } from '../shared/types';

export function createPlayerTracker(report: (playback: Playback) => void) {
  const ids = new WeakMap<HTMLVideoElement, string>();
  const bound = new WeakSet<HTMLVideoElement>();
  const events = new AbortController();
  let selected: HTMLVideoElement | undefined;
  let lastSample = 0;
  let lastId = '';

  function area(video: HTMLVideoElement): number {
    if (!video.isConnected || !Number.isFinite(video.duration) || video.duration < 60) return 0;
    const box = video.getBoundingClientRect();
    const style = getComputedStyle(video);
    if (
      box.width < 180 ||
      box.height < 100 ||
      style.visibility === 'hidden' ||
      style.visibility === 'collapse' ||
      style.display === 'none' ||
      style.opacity === '0'
    )
      return 0;
    return box.width * box.height;
  }

  function sample(video: HTMLVideoElement, urgent = false) {
    const size = area(video);
    if (!size) return;
    if (
      selected &&
      selected !== video &&
      !selected.paused &&
      !selected.ended &&
      area(selected) >= size
    )
      return;
    selected = video;
    const id = ids.get(video)!;
    if (!urgent && id === lastId && Date.now() - lastSample < 4000) return;
    lastSample = Date.now();
    lastId = id;
    report({
      videoId: id,
      currentTime: video.currentTime,
      duration: video.duration,
      paused: video.paused,
      ended: video.ended,
      rate: video.playbackRate,
      sentAt: Date.now(),
    });
  }

  function videos(root: Document | ShadowRoot): HTMLVideoElement[] {
    const result = [...root.querySelectorAll('video')];
    for (const element of root.querySelectorAll('*'))
      if (element.shadowRoot) result.push(...videos(element.shadowRoot));
    return result;
  }

  function scan(urgent = false) {
    const candidates = videos(document);
    for (const video of candidates) {
      if (bound.has(video)) continue;
      bound.add(video);
      ids.set(video, crypto.randomUUID());
      for (const event of [
        'play',
        'pause',
        'ended',
        'seeked',
        'ratechange',
        'loadedmetadata',
        'emptied',
      ])
        video.addEventListener(
          event,
          () => {
            if (event === 'emptied') ids.set(video, crypto.randomUUID());
            sample(video, true);
          },
          { signal: events.signal },
        );
      video.addEventListener('timeupdate', () => sample(video), { signal: events.signal });
    }
    const available = candidates.filter((video) => area(video));
    available.sort(
      (a, b) => Number(!b.paused && !b.ended) - Number(!a.paused && !a.ended) || area(b) - area(a),
    );
    if (selected && !area(selected)) selected = undefined;
    if (available[0]) sample(available[0], urgent);
  }

  return { scan, stop: () => events.abort() };
}
