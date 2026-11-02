import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ send: vi.fn(), permission: vi.fn() }));
vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage: mock.send }, permissions: { request: mock.permission } },
}));

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('chrome', { runtime: { id: 'test' } });
  mock.send.mockReset().mockResolvedValue({ ok: true });
  mock.permission.mockReset().mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe('website setup permission handoff', () => {
  it('sends intent and requests access synchronously without waiting for the background', async () => {
    const { setupWebsite } = await import('../src/ui/services/extension');
    let prepared!: (value: unknown) => void;
    mock.send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          prepared = resolve;
        }),
    );
    const setup = setupWebsite('https://anime.example/watch', 7);
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PREPARE_SETUP',
        tabId: 7,
        url: 'https://anime.example/watch',
      }),
    );
    expect(mock.permission).toHaveBeenCalledWith({ origins: ['https://anime.example/*'] });
    expect(mock.send.mock.invocationCallOrder[0]).toBeLessThan(
      mock.permission.mock.invocationCallOrder[0],
    );
    prepared({ ok: true });
    await setup;
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it('cancels the matching intent when access is denied', async () => {
    const { setupWebsite } = await import('../src/ui/services/extension');
    mock.permission.mockResolvedValue(false);
    await expect(setupWebsite('https://anime.example/watch', 7)).rejects.toThrow(
      'Website access was not granted',
    );
    const prepared = mock.send.mock.calls[0][0];
    expect(mock.send).toHaveBeenLastCalledWith({
      type: 'CANCEL_SETUP',
      tabId: 7,
      requestId: prepared.requestId,
    });
  });
});
