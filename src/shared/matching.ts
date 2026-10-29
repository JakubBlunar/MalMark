import { normalizeTitle, seasonNumber } from './sites';
import type { Anime } from './types';

function matchTitle(title: string): string {
  return normalizeTitle(title).replace(/\b(\d+)(?:st|nd|rd|th) season\b/g, 'season $1');
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
