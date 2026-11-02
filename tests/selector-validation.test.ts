import { describe, expect, it } from 'vitest';
import {
  inspectSiteSelectors,
  selectorPreviewText,
  selectorSyntaxError,
} from '../src/shared/selector-validation';

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('editable selector feedback', () => {
  it('validates CSS independently of whether the extension page contains a match', () => {
    const doc = parse('');
    expect(selectorSyntaxError('#watch .title', 'Anime title', doc)).toBe('');
    expect(selectorSyntaxError('???', 'Anime title', doc)).toContain('not valid CSS');
    expect(selectorSyntaxError(' ', 'Episode', doc)).toContain('Enter the episode selector');
    expect(selectorSyntaxError('a'.repeat(2001), 'Episode', doc)).toContain('2,000');
  });
  it('reports the first match and count for broad selectors', () => {
    const doc = parse('<h2>Anime</h2><b>Episode 8</b><b>Episode 9</b>');
    const preview = inspectSiteSelectors('h2', 'b', doc);
    expect(preview).toEqual({
      title: { count: 1, text: 'Anime' },
      episode: { count: 2, text: 'Episode 8' },
    });
    expect(selectorPreviewText(preview.episode)).toContain('2 matches (first used): Episode 8');
  });
  it.each(['???', '.missing', 'i', 'em'])(
    'reports unusable episode selector %s without throwing',
    (selector) => {
      const doc = parse('<h2>Anime</h2><i>Loading</i><em>Episode 12.5</em>');
      expect(inspectSiteSelectors('h2', selector, doc).episode.error).toBeTruthy();
    },
  );
  it('rejects empty text and renders markup-like text literally in previews', () => {
    const doc = parse('<h2>&lt;b&gt;An anime&lt;/b&gt;</h2><span></span><b>8</b>');
    expect(inspectSiteSelectors('span', 'b', doc).title.error).toContain('without text');
    expect(inspectSiteSelectors('h2', 'b', doc).title.text).toBe('<b>An anime</b>');
  });
});
