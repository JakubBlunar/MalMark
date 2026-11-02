import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Detection } from '../src/shared/types';
const mock = vi.hoisted(() => ({ search: vi.fn() }));
vi.mock('../src/background/mal', () => ({ searchAnime: mock.search }));
import { searchForMatch } from '../src/background/match-search';

const detection = (title: string): Detection => ({
  site: 'custom',
  title,
  season: 1,
  episode: 1,
  seriesKey: title,
  url: 'https://anime.example/watch',
});
beforeEach(() => mock.search.mockReset());

describe('fallback title discovery', () => {
  it.each([
    [
      'Reborn as a Space Mercenary: I Woke Up Piloting the Strongest Starship!',
      'Reborn as a Space Mercenary',
    ],
    [
      'Magic Repo Man: Dumped by My Party, I’ll Cash In With a Cute Support Fairy to Become the Strongest!',
      'Magic Repo Man',
    ],
  ])('finds the original anime through the shorter query %s', async (full, shortened) => {
    const anime = { id: 1, title: 'Japanese title', alternative_titles: { en: full } };
    mock.search.mockImplementation(async (query) => (query === shortened ? [anime] : []));
    expect(await searchForMatch(detection(full))).toEqual({
      query: shortened,
      results: [anime],
      match: anime,
    });
    expect(mock.search.mock.calls.map(([query]) => query)).toEqual([full, shortened]);
  });
  it('prefills the first query with candidates without automatically choosing an ambiguous result', async () => {
    const candidates = [
      { id: 1, title: 'A Long Show' },
      { id: 2, title: 'A Long Show Season 2' },
    ];
    mock.search.mockResolvedValueOnce([]).mockResolvedValueOnce(candidates);
    expect(await searchForMatch(detection('A Long Show: Site Subtitle'))).toEqual({
      query: 'A Long Show',
      results: candidates,
      match: undefined,
    });
    expect(mock.search).toHaveBeenCalledTimes(2);
  });
  it('does not automatically select a sole broad result without a matching original title', async () => {
    mock.search.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, title: 'A Long Show' }]);
    expect(
      (await searchForMatch(detection('A Long Show: An Unrelated Sequel'))).match,
    ).toBeUndefined();
  });
  it('keeps the full query when every fallback is empty and stops after an exact first result', async () => {
    const full = 'A Long Show: A Subtitle';
    mock.search.mockResolvedValue([]);
    expect(await searchForMatch(detection(full))).toEqual({
      query: full,
      results: [],
      match: undefined,
    });
    expect(mock.search.mock.calls.length).toBeLessThanOrEqual(5);
    mock.search.mockReset().mockResolvedValue([{ id: 1, title: full }]);
    expect((await searchForMatch(detection(full))).match?.id).toBe(1);
    expect(mock.search).toHaveBeenCalledTimes(1);
  });
});
