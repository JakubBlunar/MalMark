import { beforeAll, describe, expect, it, vi } from 'vitest';
import { detect, selectedEpisode } from '../src/content/detect';
import { selectorFor } from '../src/content/selectors';
import { defaultPrefix, findMapping } from '../src/shared/sites';
import type { SiteConfig } from '../src/shared/types';
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');
const config: SiteConfig = {
  id: 'site',
  origin: 'https://anime.example',
  titleSelector: '#anime-title',
  episodeSelector: '#episode',
  createdAt: 1,
};
// jsdom does not implement CSS.escape. These fixtures use plain ASCII identifiers.
beforeAll(() =>
  vi.stubGlobal('CSS', {
    escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (char) => '\\' + char),
  }),
);
describe('per-domain selectors', () => {
  it('reads title and episode independently of a changing URL', () => {
    const doc = parse(
      '<h2 id="anime-title">Cyberpunk: Edgerunners 2</h2><strong id="episode">Episode 8</strong>',
    );
    const first = detect(doc, 'https://anime.example/cyberpunk-edgerunners-4-episode-4/', config)!;
    const second = detect(doc, 'https://anime.example/completely-different-route?play=8', config)!;
    expect(first.title).toBe('Cyberpunk: Edgerunners 2');
    expect(first.episode).toBe(8);
    expect(first.seriesKey).toBe(second.seriesKey);
    expect(defaultPrefix(first)).toBe(config.origin + '/');
    const mapping = {
      id: 'rule',
      prefix: defaultPrefix(first),
      seriesKey: first.seriesKey,
      season: first.season,
      animeId: 1,
      animeTitle: 'MAL Show',
      episodeOffset: 0,
      createdAt: 1,
    };
    expect(findMapping([mapping], second)).toEqual(mapping);
    const other = detect(
      parse('<h2 id="anime-title">A Different Anime</h2><strong id="episode">Episode 8</strong>'),
      second.url,
      config,
    )!;
    expect(findMapping([mapping], other)).toBeUndefined();
  });
  it('stops detecting when either element disappears', () => {
    expect(
      detect(parse('<h2 id="anime-title">Anime</h2>'), 'https://anime.example/', config),
    ).toBeNull();
    expect(
      detect(parse('<strong id="episode">Episode 8</strong>'), 'https://anime.example/', config),
    ).toBeNull();
  });
  it('rejects a config used on another domain', () =>
    expect(detect(parse(''), 'https://other.example/', config)).toBeNull());
  it('tolerates invalid saved selectors without breaking the content script', () =>
    expect(
      detect(parse(''), 'https://anime.example/', { ...config, titleSelector: '???' }),
    ).toBeNull());
  it.each([
    ['8', 8],
    ['Episode 8', 8],
    ['S2 E8 - Title', 8],
    ['Episode 8 of 12', 8],
    ['12.5', null],
    ['Episode 12.5', null],
    ['Loading…', null],
  ])('parses episode element %s', (label, expected) =>
    expect(selectedEpisode(label as string)).toBe(expected),
  );
  it('uses explicitly configured elements across inconsistent episode slugs', () => {
    const config = {
      id: 'chosen-domain',
      origin: 'https://anime.example',
      createdAt: 1,
      titleSelector: '#ani_detail .anisc-detail h2 > a',
      episodeSelector: '#servers-content .ps_-status strong b',
    };
    const doc = parse(
      '<div id="ani_detail"><div class="anisc-detail"><h2><a href="https://anime.example/anime/cyberpunk-edgerunners-2/">Cyberpunk: Edgerunners 2</a></h2></div></div><div id="servers-content"><div class="ps_-status"><div><strong>You are watching <b>Episode 8</b></strong></div></div></div>',
    );
    const a = detect(doc, 'https://anime.example/cyberpunk-edgerunners-3-episode-3/', config)!;
    const b = detect(
      doc,
      'https://anime.example/cyberpunk-edgerunners-2-episode-8-english-sub/',
      config,
    )!;
    expect(a.episode).toBe(8);
    expect(a.title).toBe('Cyberpunk: Edgerunners 2');
    expect(a.seriesKey).toBe(b.seriesKey);
    expect(a.site).toBe('custom');
    expect(detect(doc, a.url)).toBeNull();
  });
});
describe('stable selector generation', () => {
  it('prefers a stable unique ID', () => {
    const doc = parse('<h2 id="anime-title">Title</h2>');
    expect(selectorFor(doc.querySelector('h2')!, doc)).toBe('#anime-title');
  });
  it('uses semantic attributes rather than generated IDs', () => {
    const doc = parse('<h2 id="react-123456" data-testid="show-title">Title</h2>');
    expect(selectorFor(doc.querySelector('h2')!, doc)).toBe('h2[data-testid="show-title"]');
  });
  it('does not put changing episode text from aria-label into a selector', () => {
    const doc = parse('<b class="episode" aria-label="Episode 8">8</b>');
    expect(selectorFor(doc.querySelector('b')!, doc)).toBe('b.episode');
  });
  it('disambiguates repeated elements using their stable parent', () => {
    const doc = parse(
      '<div id="watch"><h2 class="title">Anime</h2></div><div id="suggestion"><h2 class="title">Other</h2></div>',
    );
    const selected = doc.querySelector('#watch h2')!;
    const selector = selectorFor(selected, doc);
    expect(doc.querySelectorAll(selector)).toHaveLength(1);
    expect(doc.querySelector(selector)).toBe(selected);
    expect(selector).toContain('#watch');
  });
  it('anchors an initially unique bold episode label to its stable container', () => {
    const doc = parse(
      '<div id="servers-content"><div class="ps_-status"><div class="content"><div class="server-notice"><strong>You are watching <b>Episode 1</b></strong></div></div></div></div>',
    );
    const selected = doc.querySelector('b')!;
    const selector = selectorFor(selected, doc);
    expect(selector).not.toBe('b');
    expect(selector).toContain('.server-notice');
    // Other bold text may appear before the episode after page updates.
    doc.body.insertAdjacentHTML('afterbegin', '<aside><b>Episode 99</b></aside>');
    const notice = doc.querySelector('.server-notice')!;
    notice.replaceChildren();
    notice.insertAdjacentHTML(
      'beforeend',
      '<section><strong>Watching <b>Episode 2</b></strong></section>',
    );
    expect(doc.querySelectorAll(selector)).toHaveLength(1);
    expect(doc.querySelector(selector)?.textContent).toBe('Episode 2');
    doc.body.insertAdjacentHTML('beforeend', '<h2 id="anime-title">Cyberpunk: Edgerunners 2</h2>');
    expect(
      detect(doc, 'https://anime.example/next', { ...config, episodeSelector: selector })?.episode,
    ).toBe(2);
  });
  it('uses semantic ancestor attributes without relying on generated IDs', () => {
    const doc = parse('<div id="react-123456" data-testid="episode-status"><b>Episode 8</b></div>');
    const selector = selectorFor(doc.querySelector('b')!, doc);
    expect(selector).toBe('div[data-testid="episode-status"] b');
  });
  it('keeps repeated bold labels distinct within a stable container', () => {
    const doc = parse('<main id="player"><b>Episode 8</b><b>12 episodes</b></main>');
    const selected = doc.querySelector('b')!;
    const selector = selectorFor(selected, doc);
    expect(selector).toContain('#player');
    expect(doc.querySelectorAll(selector)).toHaveLength(1);
    expect(doc.querySelector(selector)).toBe(selected);
  });
  it('uses a full structural path when no semantic anchor is available', () => {
    const doc = parse('<main><p><b>Episode 8</b></p></main>');
    const selector = selectorFor(doc.querySelector('b')!, doc);
    doc.body.insertAdjacentHTML('afterbegin', '<aside><b>Advertisement</b></aside>');
    expect(selector).toContain('body > main');
    expect(doc.querySelectorAll(selector)).toHaveLength(1);
    expect(doc.querySelector(selector)?.textContent).toBe('Episode 8');
  });
});
