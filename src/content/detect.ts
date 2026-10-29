import {
  episodeNumber,
  normalizeTitle,
  positiveInteger,
  seasonNumber,
  siteForUrl,
} from '../shared/sites';
import type { Detection, SiteConfig } from '../shared/types';

function text(doc: Document, selectors: string): string {
  return doc.querySelector(selectors)?.textContent?.trim() || '';
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s*(?:\||[-–—])\s*Crunchyroll.*$/i, '')
    .replace(/^Watch\s+/i, '')
    .replace(/\s+(?:Episode|Ep\.?)\s*\d+.*$/i, '')
    .replace(/\s+English\s+(?:Subbed|Dubbed).*$/i, '')
    .trim()
    .slice(0, 200);
}

function structuredEpisode(doc: Document): Record<string, unknown> | undefined {
  const nodes: Record<string, unknown>[] = [];
  function walk(value: unknown, depth: number): void {
    if (!value || typeof value !== 'object' || depth > 8) return;
    if (Array.isArray(value)) {
      value.forEach((v) => walk(v, depth + 1));
      return;
    }
    const item = value as Record<string, unknown>;
    if (item['@type'] === 'TVEpisode') nodes.push(item);
    Object.values(item).forEach((v) => walk(v, depth + 1));
  }
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      walk(JSON.parse(script.textContent || ''), 0);
    } catch {
      /* malformed site metadata */
    }
  }
  return nodes[0];
}

export function selectedEpisode(value: string): number | null {
  const trimmed = value.trim().slice(0, 200);
  return (
    episodeNumber(trimmed) || (/^\d+$/.test(trimmed) ? positiveInteger(Number(trimmed)) : null)
  );
}

export function detectCustom(doc: Document, value: string, config: SiteConfig): Detection | null {
  const url = new URL(value);
  if (url.origin !== config.origin || url.protocol !== 'https:') return null;
  try {
    const titleNode = doc.querySelector(config.titleSelector);
    const episodeNode = doc.querySelector(config.episodeSelector);
    // Missing selectors on listings or redesigned pages must not reuse stale metadata.
    if (!titleNode || !episodeNode) return null;
    const title = cleanTitle(titleNode.textContent?.trim() || '');
    if (!title) return null;
    const season = seasonNumber(title);
    return {
      site: 'custom',
      url: url.href,
      title,
      episode: selectedEpisode(episodeNode.textContent || ''),
      season,
      seriesKey: `${url.origin}:${normalizeTitle(title)}:s${season ?? '?'}`,
    };
  } catch {
    return null;
  }
}

export function detect(doc: Document, value: string, custom?: SiteConfig): Detection | null {
  if (custom) return detectCustom(doc, value, custom);
  const site = siteForUrl(value);
  if (!site) return null;
  const url = new URL(value);
  if (!/\/watch\//.test(url.pathname)) return null;
  const ld = structuredEpisode(doc);
  const series = ld?.partOfSeries as { name?: string; url?: string } | undefined;
  const seasonData = ld?.partOfSeason as { seasonNumber?: number } | undefined;
  const titleMeta =
    doc.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content || doc.title;
  const seriesLink = doc.querySelector<HTMLAnchorElement>('a[href*="/series/"]');
  const name =
    series?.name ||
    text(doc, '[data-testid="series-title"], [data-t="series-title"], [data-t="show-title"]') ||
    seriesLink?.textContent?.trim() ||
    titleMeta;
  const title = cleanTitle(name);
  if (!title || /^(?:crunchyroll|watch|just a moment|access denied)$/i.test(title)) return null;
  const episodeLabel =
    text(
      doc,
      '[data-testid="episode-title"], [data-t="episode-title"], [data-t="episode-number"], .current-media h4',
    ) || text(doc, 'h1');
  const episode =
    positiveInteger(Number(ld?.episodeNumber)) ||
    episodeNumber(episodeLabel) ||
    episodeNumber(titleMeta);
  const seasonLabel = text(
    doc,
    '[data-testid="season-title"], [data-t="season-title"], [data-t="season-name"], [data-t="season-selector"]',
  );
  const season =
    positiveInteger(Number(seasonData?.seasonNumber)) ||
    seasonNumber(seasonLabel) ||
    seasonNumber(episodeLabel) ||
    seasonNumber(title) ||
    // Crunchyroll may put "Season 4" only in document.title while og:title is the general series.
    seasonNumber(doc.title) ||
    seasonNumber(titleMeta);
  // Crunchyroll has episode-specific URLs, so prefer its series ID, then a normalized title.
  const seriesPath =
    seriesLink?.getAttribute('href')?.match(/\/series\/([^/]+)/)?.[1] ||
    series?.url?.match(/\/series\/([^/]+)/)?.[1];
  const seriesKey = `crunchyroll:${seriesPath || normalizeTitle(title)}:s${season ?? '?'}`;
  return { site, url: url.href, seriesKey, title, episode, season };
}
