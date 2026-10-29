import type { Detection, Mapping, Site } from './types';

export function siteForUrl(value: string): Site | null {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:') return null;
    if (u.hostname === 'crunchyroll.com' || u.hostname.endsWith('.crunchyroll.com'))
      return 'crunchyroll';
  } catch {
    /* invalid URL */
  }
  return null;
}

export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\([^)]*(?:dub|sub|audio)[^)]*\)/gi, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function episodeNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/(?:episode|ep\.?|\bE)\s*[-:#]?\s*(\d+)(?![\d.])/i);
  return match ? positiveInteger(Number(match[1])) : null;
}

export function seasonNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(
    /\bseason\s*(\d+)\b|\bS\s*(\d+)\b|\b(\d+)(?:st|nd|rd|th)\s+season\b|第\s*(\d+)\s*期/i,
  );
  return match ? positiveInteger(Number(match.slice(1).find(Boolean))) : null;
}

export function positiveInteger(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 && value <= 100000 ? value : null;
}

export function defaultPrefix(detection: Detection): string {
  const u = new URL(detection.url);
  u.hash = '';
  u.search = '';
  // Crunchyroll watch URLs identify individual episodes; title + season scopes the rule.
  if (detection.site === 'crunchyroll' && detection.season !== null)
    u.pathname = u.pathname.replace(/\/watch\/.*$/, '/watch/');
  if (detection.site === 'custom') u.pathname = '/';
  return u.href;
}

export function prefixMatches(prefix: string, value: string): boolean {
  try {
    const p = new URL(prefix);
    const u = new URL(value);
    if (p.protocol !== 'https:' || p.origin !== u.origin || p.hash) return false;
    if (p.search)
      return (
        u.pathname === p.pathname &&
        [...p.searchParams].every(([k, v]) => u.searchParams.get(k) === v)
      );
    return (
      u.pathname === p.pathname ||
      (p.pathname.endsWith('/') && u.pathname.startsWith(p.pathname)) ||
      u.pathname.startsWith(p.pathname + '/')
    );
  } catch {
    return false;
  }
}

export function findMapping(mappings: Mapping[], d: Detection): Mapping | undefined {
  return mappings
    .filter((m) => {
      if (!prefixMatches(m.prefix, d.url)) return false;
      if (m.seriesKey === d.seriesKey && m.season === d.season) return true;
      // Older Crunchyroll detections missed the season. Preserve an explicit match
      // for that exact episode URL when a newer detector supplies the missing season.
      return (
        d.site === 'crunchyroll' &&
        m.season === null &&
        m.seriesKey.endsWith(':s?') &&
        m.seriesKey.slice(0, -3) === d.seriesKey.replace(/:s\d+$/, '') &&
        new URL(m.prefix).pathname === new URL(d.url).pathname
      );
    })
    .sort((a, b) => b.prefix.length - a.prefix.length || b.createdAt - a.createdAt)[0];
}
