import { episodeNumber, positiveInteger } from './sites';

export interface SelectorPreview {
  count: number;
  text: string;
  error?: string;
}

export interface SiteSelectorPreview {
  title: SelectorPreview;
  episode: SelectorPreview;
}

export function selectorSyntaxError(
  value: string,
  label: string,
  doc: Document = document,
): string {
  if (!value.trim()) return `Enter the ${label.toLowerCase()} selector.`;
  if (value.length > 2000) return `${label} selector must be 2,000 characters or fewer.`;
  try {
    doc.querySelector(value);
    return '';
  } catch {
    return `${label} selector is not valid CSS.`;
  }
}

export function inspectSiteSelectors(
  titleSelector: string,
  episodeSelector: string,
  doc: Document = document,
): SiteSelectorPreview {
  const inspect = (value: string, label: string, episode = false): SelectorPreview => {
    const error = selectorSyntaxError(value, label, doc);
    if (error) return { count: 0, text: '', error };
    const nodes = doc.querySelectorAll(value);
    const text = nodes[0]?.textContent?.trim().slice(0, 200) || '';
    const result = { count: nodes.length, text };
    if (!nodes.length)
      return { ...result, error: `${label} selector matches no elements on this page.` };
    if (!text) return { ...result, error: `${label} selector matches an element without text.` };
    if (episode && !(episodeNumber(text) || (/^\d+$/.test(text) && positiveInteger(Number(text)))))
      return { ...result, error: 'Episode selector does not contain a whole episode number.' };
    return result;
  };
  return {
    title: inspect(titleSelector, 'Anime title'),
    episode: inspect(episodeSelector, 'Episode', true),
  };
}

export function selectorPreviewText(result: SelectorPreview): string {
  if (result.error) return result.error;
  return `${result.count} ${result.count === 1 ? 'match' : 'matches (first used)'}: ${result.text}`;
}
