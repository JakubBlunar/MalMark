import { describe, expect, it } from 'vitest';
import { automaticMatch, matchSearchQueries, titleForSeason } from '../src/shared/matching';
import type { Anime } from '../src/shared/types';

// Factual title/alias fields from the public MAL API search on 2026-10-28.
const title = 'Re:ZERO -Starting Life in Another World-';
const entries: Anime[] = [
  {
    id: 31240,
    title: 'Re:Zero kara Hajimeru Isekai Seikatsu',
    media_type: 'tv',
    num_episodes: 25,
    alternative_titles: { en: title, synonyms: ['ReZero'] },
  },
  {
    id: 61316,
    title: 'Re:Zero kara Hajimeru Isekai Seikatsu 4th Season',
    media_type: 'tv',
    num_episodes: 19,
    alternative_titles: {
      en: title + ' Season 4',
      synonyms: ['ReZero', 'Re: Life in a different world from zero'],
    },
  },
  {
    id: 38389,
    title: 'He Wei Dao x Re:Cong Ling Kaishi de Yi Shijie Shenghuo',
    media_type: 'cm',
    num_episodes: 3,
    alternative_titles: { en: 'He Wei Dao x Re:ZERO', synonyms: [title, 'ReZero'] },
  },
];
describe('exact title ranking and seasons', () => {
  it('treats an explicit first season as the base title without dropping later seasons', () => {
    expect(automaticMatch('Re:Zero kara Hajimeru Isekai Seikatsu Season 1', entries)?.id).toBe(
      31240,
    );
    expect(automaticMatch(titleForSeason(title, 3), entries)).toBeUndefined();
  });
  it('does not let a commercial alias block the primary Re:ZERO TV title', () => {
    expect(automaticMatch(title, entries)?.id).toBe(31240);
  });
  it('still prefers primary titles if MAL omits media_type on another alias result', () => {
    expect(
      automaticMatch(
        title,
        entries.map((a) => ({ ...a, media_type: undefined })),
      )?.id,
    ).toBe(31240);
  });
  it('uses the detected season to select season four rather than the first season', () => {
    expect(automaticMatch(titleForSeason(title, 4), entries)?.id).toBe(61316);
  });
  it('recognizes ordinal season spellings without discarding the season number', () => {
    expect(automaticMatch('Re:Zero kara Hajimeru Isekai Seikatsu Season 4', entries)?.id).toBe(
      61316,
    );
    expect(
      automaticMatch('Re:Zero kara Hajimeru Isekai Seikatsu Season 3', entries),
    ).toBeUndefined();
  });
  it('retains ambiguity for a short alias shared by multiple TV seasons', () => {
    expect(automaticMatch('ReZero', entries)).toBeUndefined();
  });
  it('retains ambiguity when two entries have the same primary title', () => {
    expect(automaticMatch(title, [entries[0], { ...entries[0], id: 999 }])).toBeUndefined();
  });
  it('never collapses a split season into another part', () => {
    const parts: Anime[] = [
      { id: 1, title: 'Show 2nd Season' },
      { id: 2, title: 'Show 2nd Season Part 2' },
    ];
    expect(automaticMatch('Show Season 2 Part 2', parts)?.id).toBe(2);
    expect(automaticMatch('Show Season 2', parts)?.id).toBe(1);
  });
  it('does not duplicate an existing explicit season or mistake the word season for a number', () => {
    expect(titleForSeason(title + ' Season 4', 4)).toBe(title + ' Season 4');
    expect(titleForSeason('A Season of Rain', 4)).toBe('A Season of Rain Season 4');
  });
  it('keeps Slime season four matched through its exact English title', () => {
    const slime: Anime = {
      id: 59970,
      title: 'Tensei shitara Slime Datta Ken 4th Season',
      alternative_titles: { en: 'That Time I Got Reincarnated as a Slime Season 4' },
      media_type: 'tv',
    };
    expect(
      automaticMatch(titleForSeason('That Time I Got Reincarnated as a Slime', 4), [slime])?.id,
    ).toBe(59970);
  });
});

describe('shorter search queries', () => {
  it.each([
    [
      'Reborn as a Space Mercenary: I Woke Up Piloting the Strongest Starship!',
      'Reborn as a Space Mercenary',
    ],
    [
      'Magic Repo Man: Dumped by My Party, I’ll Cash In With a Cute Support Fairy to Become the Strongest!',
      'Magic Repo Man',
    ],
  ])('tries the subtitle-free query for %s', (full, shortened) => {
    expect(matchSearchQueries(full, 1).slice(0, 2)).toEqual([full, shortened]);
  });
  it('retains later seasons and split parts in every fallback query', () => {
    const queries = matchSearchQueries('A Very Long Show: Another Adventure Season 4 Part 2', 4);
    expect(queries.length).toBeGreaterThan(1);
    for (const query of queries) {
      expect(query).toContain('Season 4');
      expect(query).toContain('Part 2');
    }
    expect(matchSearchQueries('A Show Season 1', 1)).toEqual(['A Show Season 1', 'A Show']);
  });
  it('keeps season markers when a fallback query must fit MAL’s character limit', () => {
    const full =
      'A Very Long Anime Title With An Extremely Long Subtitle '.repeat(3) + 'Season 4 Part 2';
    const queries = matchSearchQueries(full, 4).slice(1);
    expect(queries.length).toBeGreaterThan(0);
    for (const query of queries) {
      expect(query.length).toBeLessThanOrEqual(100);
      expect(query).toContain('Season 4');
      expect(query).toContain('Part 2');
    }
  });
  it('keeps short titles intact and bounds long-title requests', () => {
    expect(matchSearchQueries('Re:ZERO', null)).toEqual(['Re:ZERO']);
    expect(matchSearchQueries('86', null)).toEqual(['86']);
    expect(
      matchSearchQueries('A Very Long Name With Lots Of Extra Words For Discovery', null).length,
    ).toBeLessThanOrEqual(5);
  });
});
