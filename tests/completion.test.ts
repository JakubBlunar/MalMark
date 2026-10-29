import { describe, expect, it, vi } from 'vitest';
import { canCompleteAnime, localDate } from '../src/shared/completion';
import type { Anime } from '../src/shared/types';
const anime: Anime = {
  id: 1,
  title: 'Finished Show',
  status: 'finished_airing',
  num_episodes: 12,
  my_list_status: { status: 'watching', num_episodes_watched: 12 },
};
describe('series completion eligibility', () => {
  it('formats the local calendar date with padded months and days', () => {
    expect(localDate(new Date(2026, 0, 2, 0, 15))).toBe('2026-01-02');
    expect(localDate(new Date(2026, 9, 30, 23, 45))).toBe('2026-10-30');
  });
  it.each([
    ['Pacific/Kiritimati', '2026-10-29T23:30:00Z', '2026-10-30'],
    ['America/Los_Angeles', '2026-10-30T01:30:00Z', '2026-10-29'],
  ])('uses the calendar day in %s across UTC midnight', (timezone, instant, expected) => {
    vi.stubEnv('TZ', timezone);
    try {
      expect(localDate(new Date(instant))).toBe(expected);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it('allows completion after all episodes are logged, or from the queued finale', () => {
    expect(canCompleteAnime(anime)).toBe(true);
    const watching = {
      ...anime,
      my_list_status: { ...anime.my_list_status!, num_episodes_watched: 11 },
    };
    expect(canCompleteAnime(watching)).toBe(false);
    expect(canCompleteAnime(watching, 12)).toBe(true);
  });
  it.each<Partial<Anime>>([
    { status: 'currently_airing' },
    { status: 'not_yet_aired' },
    { status: undefined },
    { num_episodes: 0 },
    { num_episodes: undefined },
    { my_list_status: undefined },
    { my_list_status: { status: 'completed', num_episodes_watched: 12 } },
    { my_list_status: { status: 'watching', num_episodes_watched: 12, is_rewatching: true } },
  ])('hides completion for ineligible or incomplete metadata: %j', (overrides) =>
    expect(canCompleteAnime({ ...anime, ...overrides })).toBe(false),
  );
});
