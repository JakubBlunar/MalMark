import { describe, expect, it } from 'vitest';
import { detect } from '../src/content/detect';
import {
  defaultPrefix,
  episodeNumber,
  findMapping,
  normalizeTitle,
  prefixMatches,
  siteForUrl,
} from '../src/shared/sites';
import { automaticMatch } from '../src/shared/matching';
import type { Anime, Detection, Mapping } from '../src/shared/types';

function page(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}
const crunchy = 'https://www.crunchyroll.com/watch/ABC/episode-title';
describe('site adapters', () => {
  it('uses Crunchyroll structured metadata and stable series ID', () => {
    const doc = page(
      '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"TVEpisode","episodeNumber":7,"partOfSeries":{"name":"Frieren","url":"https://www.crunchyroll.com/series/XYZ/frieren"},"partOfSeason":{"seasonNumber":1}}]}</script>',
    );
    expect(detect(doc, crunchy)).toMatchObject({
      title: 'Frieren',
      episode: 7,
      season: 1,
      seriesKey: 'crunchyroll:XYZ:s1',
    });
  });
  it('detects Crunchyroll series title and S2 E3 labels', () => {
    const doc = page('<a href="/series/XYZ/show">A Show</a><h1>S2 E3 - Another day</h1>');
    expect(detect(doc, crunchy)).toMatchObject({ title: 'A Show', episode: 3, season: 2 });
  });
  it('reads Re:ZERO season four from the page title when the player only says E19', () => {
    const doc = page(
      '<title>Season 4 From Now On - Watch on Crunchyroll</title><meta property="og:title" content="Re:ZERO -Starting Life in Another World-"><a href="/series/REZERO/show">Re:ZERO -Starting Life in Another World-</a><h1>E19 - From Now On</h1>',
    );
    expect(
      detect(doc, 'https://www.crunchyroll.com/watch/GE00345558JAJP/from-now-on'),
    ).toMatchObject({
      title: 'Re:ZERO -Starting Life in Another World-',
      episode: 19,
      season: 4,
      seriesKey: 'crunchyroll:REZERO:s4',
    });
  });
  it('keeps Slime season-four detection when its season is present in the page title', () => {
    const doc = page(
      '<title>Season 4 Tempest Evolves - Watch on Crunchyroll</title><a href="/series/SLIME/show">That Time I Got Reincarnated as a Slime</a><h1>E1 - Tempest Evolves</h1>',
    );
    expect(
      detect(doc, 'https://www.crunchyroll.com/watch/GE00374376JAJP/tempest-evolves'),
    ).toMatchObject({ season: 4, episode: 1 });
  });
  it('prefers structured season metadata over unrelated season text in a title', () => {
    const doc = page(
      '<title>Season 9 Behind the Scenes</title><script type="application/ld+json">{"@type":"TVEpisode","episodeNumber":3,"partOfSeries":{"name":"A Show"},"partOfSeason":{"seasonNumber":2}}</script>',
    );
    expect(detect(doc, crunchy)?.season).toBe(2);
  });
  it('does not enable the retired adapter without user setup', () => {
    const doc = page(
      '<h2 class="film-name">Frieren</h2><div class="ss-list"><a class="active" data-number="25">25</a></div>',
    );
    expect(detect(doc, 'https://aniwatch.co.at/watch/frieren-199?ep=123456')).toBeNull();
  });
  it('falls back to page metadata without inventing an episode', () => {
    expect(
      detect(
        page('<title>Watch A Show - Crunchyroll</title>'),
        'https://www.crunchyroll.com/watch/a-show-2?ep=99',
      ),
    ).toMatchObject({ title: 'A Show', episode: null });
  });
  it('rejects fractional special episodes instead of rounding them', () => {
    expect(episodeNumber('Episode 12.5')).toBeNull();
    expect(
      detect(page('<a href="/series/SHOW/a-show">Show</a><h1>Episode 12.5</h1>'), crunchy),
    ).toMatchObject({ episode: null });
  });
  it('ignores malformed JSON-LD and uses DOM fallback', () => {
    expect(
      detect(
        page(
          '<script type="application/ld+json">bad</script><a href="/series/ABC/show">Show</a><h1>Episode 3</h1>',
        ),
        crunchy,
      )?.episode,
    ).toBe(3);
  });
  it.each([
    'https://crunchyroll.com/series/ABC/show',
    'https://aniwatch.co.at/home',
    'https://www.netflix.com/watch/81234567',
    'https://evil.example/watch/show',
    'https://crunchyroll.com.evil.example/watch/show',
  ])('does not track unsupported page %s', (url) => expect(detect(page(''), url)).toBeNull());
  it('rejects lookalike hosts and non-HTTPS pages', () => {
    expect(siteForUrl('https://evilcrunchyroll.com/watch/id')).toBeNull();
    expect(siteForUrl('http://crunchyroll.com/watch/id')).toBeNull();
    expect(siteForUrl('https://www.crunchyroll.com/watch/id')).toBe('crunchyroll');
    expect(siteForUrl('https://www.aniwatch.co.at/watch/id')).toBeNull();
    expect(siteForUrl('https://netflix.com/watch/81234567')).toBeNull();
  });
});
describe('manual mapping rules', () => {
  const d: Detection = {
    site: 'crunchyroll',
    url: 'https://www.crunchyroll.com/watch/show-123?ep=997',
    seriesKey: 'crunchyroll:SHOW:s?',
    title: 'Show',
    episode: 25,
    season: null,
  };
  const rule: Mapping = {
    id: '1',
    prefix: 'https://www.crunchyroll.com/watch/show-123',
    seriesKey: d.seriesKey,
    season: null,
    animeId: 3,
    animeTitle: 'Show 2',
    episodeOffset: -24,
    createdAt: 1,
  };
  it('removes episode query parameters from default prefixes', () =>
    expect(defaultPrefix(d)).toBe(rule.prefix));
  it('matches future episodes with a different opaque ID', () =>
    expect(
      findMapping([rule], { ...d, url: 'https://www.crunchyroll.com/watch/show-123?ep=998' }),
    ).toEqual(rule));
  it('requires path boundaries and the same origin', () => {
    expect(prefixMatches(rule.prefix, 'https://www.crunchyroll.com/watch/show-1234')).toBe(false);
    expect(prefixMatches(rule.prefix, 'https://other.example/watch/show-123')).toBe(false);
    expect(prefixMatches(rule.prefix, 'https://www.crunchyroll.com/watch/show-123/episode-2')).toBe(
      true,
    );
  });
  it('prefers the most specific rule', () =>
    expect(
      findMapping([{ ...rule, id: 'broad', prefix: 'https://www.crunchyroll.com/watch/' }, rule], d)
        ?.id,
    ).toBe('1'));
  it('supports query-specific exceptions', () =>
    expect(prefixMatches(rule.prefix + '?ep=997', d.url)).toBe(true));
  it('scopes broad Crunchyroll watch prefixes to series and season', () => {
    const c = {
      ...d,
      site: 'crunchyroll' as const,
      url: crunchy,
      seriesKey: 'crunchyroll:ABC:s2',
      season: 2,
    };
    const r = {
      ...rule,
      prefix: 'https://www.crunchyroll.com/watch/',
      seriesKey: c.seriesKey,
      season: 2,
    };
    expect(findMapping([r], c)).toEqual(r);
    expect(findMapping([r], { ...c, season: 1 })).toBeUndefined();
    expect(findMapping([r], { ...c, seriesKey: 'crunchyroll:OTHER:s2' })).toBeUndefined();
  });
  it('preserves an old manual match for the exact Crunchyroll episode when its season becomes known', () => {
    const c = {
      ...d,
      site: 'crunchyroll' as const,
      url: crunchy,
      seriesKey: 'crunchyroll:ABC:s4',
      season: 4,
    };
    const legacy = { ...rule, prefix: crunchy, seriesKey: 'crunchyroll:ABC:s?', season: null };
    expect(findMapping([legacy], c)).toEqual(legacy);
    expect(
      findMapping([legacy], {
        ...c,
        url: 'https://www.crunchyroll.com/watch/NEXT/another-episode',
      }),
    ).toBeUndefined();
    expect(
      findMapping([{ ...legacy, prefix: 'https://www.crunchyroll.com/watch/' }], c),
    ).toBeUndefined();
  });
});
describe('conservative matching', () => {
  const candidates: Anime[] = [
    {
      id: 1,
      title: 'Sousou no Frieren',
      alternative_titles: { en: 'Frieren: Beyond Journey’s End' },
    },
    { id: 2, title: 'Frieren Season 2' },
  ];
  it('uses exact alternative titles', () =>
    expect(automaticMatch("Frieren: Beyond Journey's End", candidates)?.id).toBe(1));
  it('leaves ambiguous aliases for the user', () =>
    expect(
      automaticMatch('Show', [
        { id: 1, title: 'Show' },
        { id: 2, title: 'Other', alternative_titles: { en: 'Show' } },
      ]),
    ).toBeUndefined());
  it('never fuzzy-selects a sequel', () =>
    expect(automaticMatch('Frieren', candidates)).toBeUndefined());
  it('normalizes punctuation and accents while retaining season numbers', () => {
    expect(normalizeTitle('Pokémon: Season 2 (English Dub)')).toBe('pokemon season 2');
    expect(automaticMatch('Show Season 2', [{ id: 1, title: 'Show' }])).toBeUndefined();
  });
});
