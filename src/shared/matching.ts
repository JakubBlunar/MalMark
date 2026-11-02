import { normalizeTitle, seasonNumber } from './sites';
import type { Anime } from './types';

function matchTitle(title: string): string {
  return normalizeTitle(title)
    .replace(/\b(\d+)(?:st|nd|rd|th) season\b/g, 'season $1')
    .replace(/\bseason 1\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Broaden discovery, retaining explicit sequel/part markers. Results still have
// to match the original title to be selected automatically.
export function matchSearchQueries(title: string, season: number | null): string[] {
  const full = titleForSeason(title, season).trim();
  const base = full
    .replace(/\b(?:season\s*1|1st\s+season)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const markers =
    base.match(
      /\b(?:season\s*\d+|\d+(?:st|nd|rd|th)\s+season|part\s*\d+|cour\s*\d+|s\d+)\b|第\s*\d+\s*期|\b\d+$/gi,
    ) || [];
  const queries = [full];
  const add = (value: string) => {
    let query = value.replace(/[\s:|–—-]+$/g, '').trim();
    for (const marker of markers)
      if (!` ${matchTitle(query)} `.includes(` ${matchTitle(marker)} `)) query += ` ${marker}`;
    if (query.length > 100) {
      const suffix = markers.length ? ` ${markers.join(' ')}` : '';
      query = query.slice(0, Math.max(0, 100 - suffix.length)).trimEnd() + suffix;
    }
    if (query.length >= 2 && !queries.some((q) => q.slice(0, 100) === query)) queries.push(query);
  };
  add(base);
  add(base.split(/:\s+|\s+[-–—|]\s+/)[0]);
  const words = base.split(/\s+/);
  if (words.length > 3) {
    add(words.slice(0, Math.max(3, Math.ceil(words.length * 0.65))).join(' '));
    add(words.slice(0, 3).join(' '));
    add(words.slice(0, 2).join(' '));
  }
  return queries.slice(0, 5);
}

export function titleForSeason(title: string, season: number | null): string {
  return season && season > 1 && !seasonNumber(title) ? `${title} Season ${season}` : title;
}

export function automaticMatch(title: string, candidates: Anime[]): Anime | undefined {
  const normalized = matchTitle(title);
  if (!normalized) return;
  // Keep exact matching, but prefer the main/localized title over a loosely reused synonym.
  // MAL includes commercials with the exact Re:ZERO series title as a synonym.
  const eligible = candidates.filter((a) => !['cm', 'pv', 'music'].includes(a.media_type || ''));
  const same = (value?: string) => !!value && matchTitle(value) === normalized;
  const primary = eligible.filter((a) =>
    [a.title, a.alternative_titles?.en, a.alternative_titles?.ja].some(same),
  );
  if (primary.length) return primary.length === 1 ? primary[0] : undefined;
  const aliases = eligible.filter((a) => a.alternative_titles?.synonyms?.some(same));
  return aliases.length === 1 ? aliases[0] : undefined;
}
