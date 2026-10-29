import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      id: 'test',
      sendMessage: mock.send,
      getURL: (path: string) => `moz-extension://test/${path}`,
      onMessage: { addListener: mock.add, removeListener: mock.remove },
    },
  },
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetModules();
  mock.send.mockReset();
  mock.add.mockClear();
  vi.stubGlobal('location', { href: 'https://www.crunchyroll.com/watch/EP/episode' });
  document.body.innerHTML =
    '<a href="/series/SHOW/show">A Show</a><h1>Episode 2</h1><video></video>';
  const video = document.querySelector('video')!;
  Object.defineProperties(video, {
    duration: { value: 1000, configurable: true },
    currentTime: { value: 10, configurable: true },
    paused: { value: false, configurable: true },
  });
  video.getBoundingClientRect = () => ({ width: 640, height: 360 }) as DOMRect;
  mock.send.mockImplementation(async () => ({ ok: true, data: undefined }));
});
afterEach(() => {
  window.__malmarkController?.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
describe('recoverable content connection', () => {
  it('sizes the current reminder from verified messages, follows viewport changes and can shrink', async () => {
    vi.stubGlobal('innerHeight', 900);
    const attach = vi.spyOn(Element.prototype, 'attachShadow');
    mock.send.mockImplementation(async (message) => ({
      ok: true,
      data:
        message.type === 'PROMPT_STATE'
          ? { pending: [{ id: '5:1:2' }], nonce: 'size-grant', showPrompts: true }
          : undefined,
    }));
    await import('../src/content/index');
    await vi.advanceTimersByTimeAsync(6000);
    const frame = (attach.mock.results.at(-1)!.value as ShadowRoot).querySelector('iframe')!;
    const receive = mock.add.mock.calls.at(-1)![0];
    const size = { type: 'INLINE_PROMPT_SIZE', nonce: 'size-grant', height: 300 };
    expect(frame.style.height).toBe('220px');
    await receive(size, { id: 'other' });
    await receive(size, { id: 'test', tab: { id: 1 } });
    await receive({ ...size, nonce: 'old-frame' }, { id: 'test' });
    await receive({ ...size, height: Infinity }, { id: 'test' });
    expect(frame.style.height).toBe('220px');
    await receive(size, { id: 'test' });
    expect(frame.style.height).toBe('300px');
    vi.stubGlobal('innerHeight', 250);
    window.dispatchEvent(new Event('resize'));
    expect(frame.style.height).toBe('202px');
    vi.stubGlobal('innerHeight', 900);
    window.dispatchEvent(new Event('resize'));
    expect(frame.style.height).toBe('300px');
    await receive({ ...size, height: 180 }, { id: 'test' });
    expect(frame.style.height).toBe('180px');
  });
  it('detects an SPA episode and resets the reused player while an old detection is still pending', async () => {
    let finishOld: (value: unknown) => void = () => {};
    let first = true;
    mock.send.mockImplementation(async (message) => {
      if (message.type === 'DETECTION' && message.detection && first) {
        first = false;
        return new Promise((resolve) => {
          finishOld = resolve;
        });
      }
      return { ok: true, data: undefined };
    });
    await import('../src/content/index');
    await vi.advanceTimersByTimeAsync(5000);
    vi.stubGlobal('location', { href: 'https://www.crunchyroll.com/watch/NEXT/next' });
    document.querySelector('h1')!.textContent = 'Episode 3';
    const video = document.querySelector('video')!;
    Object.defineProperty(video, 'currentTime', { value: 0, configurable: true });
    await mock.add.mock.calls.at(-1)![0]({ type: 'ROUTE_CHANGED', pageUrl: location.href });
    await vi.advanceTimersByTimeAsync(6000);
    expect(
      mock.send.mock.calls.some(([m]) => m.type === 'DETECTION' && m.detection?.episode === 3),
    ).toBe(true);
    expect(
      mock.send.mock.calls.some(
        ([m]) =>
          m.type === 'PLAYBACK' && m.pageUrl === location.href && m.playback.currentTime === 0,
      ),
    ).toBe(true);
    finishOld({ ok: true });
    await vi.advanceTimersByTimeAsync(6000);
    const plays = mock.send.mock.calls.filter(([m]) => m.type === 'PLAYBACK');
    expect(plays.every(([m]) => m.pageUrl === location.href)).toBe(true);
  });
  it('recovers if an initialization message never settles', async () => {
    mock.send.mockImplementationOnce(() => new Promise(() => {}));
    await import('../src/content/index');
    await vi.advanceTimersByTimeAsync(15000);
    expect(
      mock.send.mock.calls.filter(([message]) => message.type === 'GET_SITE_CONFIG').length,
    ).toBeGreaterThanOrEqual(2);
    expect(mock.send.mock.calls.some(([message]) => message.type === 'PLAYBACK')).toBe(true);
  });
  it('resamples immediately on a background health check without waiting for video events', async () => {
    await import('../src/content/index');
    await vi.advanceTimersByTimeAsync(6000);
    mock.send.mockClear();
    await mock.add.mock.calls.at(-1)![0]({ type: 'PING_PLAYER' });
    expect(mock.send.mock.calls.some(([message]) => message.type === 'PLAYBACK')).toBe(true);
  });
  it('retries initialization after a missing background receiver and reconnects playback', async () => {
    mock.send.mockRejectedValueOnce(
      new Error('Could not establish connection. Receiving end does not exist.'),
    );
    await import('../src/content/index');
    await vi.advanceTimersByTimeAsync(10000);
    expect(
      mock.send.mock.calls.filter(([message]) => message.type === 'GET_SITE_CONFIG').length,
    ).toBeGreaterThanOrEqual(2);
    expect(mock.send.mock.calls.some(([message]) => message.type === 'PLAYBACK')).toBe(true);
  });
  it('retries an unacknowledged detection and recovers from a dropped playback message', async () => {
    let detectionFailed = false;
    let playbackFailed = false;
    mock.send.mockImplementation(async (message) => {
      if (message.type === 'DETECTION' && !detectionFailed) {
        detectionFailed = true;
        throw new Error('Background is restarting');
      }
      if (message.type === 'PLAYBACK' && !playbackFailed) {
        playbackFailed = true;
        throw new Error('Message port closed');
      }
      return { ok: true, data: undefined };
    });
    await import('../src/content/index');
    await vi.advanceTimersByTimeAsync(20000);
    expect(
      mock.send.mock.calls.filter(([message]) => message.type === 'DETECTION').length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      mock.send.mock.calls.filter(([message]) => message.type === 'PLAYBACK').length,
    ).toBeGreaterThanOrEqual(2);
    expect(window.__malmarkController).toBeDefined();
    const listener = mock.add.mock.calls.at(-1)![0];
    expect(await listener({ type: 'PING_PLAYER' })).toEqual({ ready: true });
  });
  it.each(['async', 'sync'])(
    'stops an invalidated extension context (%s) so reinjection can initialize a fresh controller',
    async (mode) => {
      if (mode === 'sync')
        mock.send.mockImplementationOnce(() => {
          throw new Error('Extension context invalidated.');
        });
      else mock.send.mockRejectedValueOnce(new Error('Extension context invalidated.'));
      await import('../src/content/index');
      await vi.advanceTimersByTimeAsync(0);
      expect(window.__malmarkController).toBeUndefined();
      const count = mock.send.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10000);
      expect(mock.send).toHaveBeenCalledTimes(count);
      vi.resetModules();
      await import('../src/content/index');
      await vi.advanceTimersByTimeAsync(10000);
      expect(mock.send.mock.calls.some(([message]) => message.type === 'PLAYBACK')).toBe(true);
    },
  );
});
