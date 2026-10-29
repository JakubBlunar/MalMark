import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      sendMessage: mock.send,
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
    duration: { value: 1000 },
    currentTime: { value: 10 },
    paused: { value: false },
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
