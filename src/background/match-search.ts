import { automaticMatch, matchSearchQueries, titleForSeason } from '../shared/matching';
import type { Detection } from '../shared/types';
import { searchAnime } from './mal';

export async function searchForMatch(detection: Detection) {
  const title = titleForSeason(detection.title, detection.season);
  for (const query of matchSearchQueries(detection.title, detection.season)) {
    const results = await searchAnime(query);
    if (results.length) return { query, results, match: automaticMatch(title, results) };
  }
  return { query: title, results: [], match: undefined };
}
