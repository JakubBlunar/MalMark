import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInstance } from 'i18next';
import { languages, isLanguagePreference, resolveLanguage } from '../src/shared/localization';

const english = JSON.parse(readFileSync('public/locales/en.json', 'utf8')) as Record<
  string,
  string
>;
const placeholders = (text: string) =>
  [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((match) => match[1]).sort();
const tags = (text: string) => [...text.matchAll(/<\/?(\w+)>/g)].map((match) => match[0]).sort();

describe('language selection', () => {
  it('matches regional device languages in preference order', () => {
    expect(resolveLanguage('auto', ['ja-JP', 'sk-SK', 'de-DE'])).toBe('sk');
    expect(resolveLanguage('auto', ['en-GB', 'cs-CZ'])).toBe('en');
    expect(resolveLanguage('auto', ['es-MX'])).toBe('es');
    expect(resolveLanguage('auto', ['pt-PT'])).toBe('pt-BR');
    expect(resolveLanguage('auto', ['ID_id'])).toBe('id');
  });
  it('honors manual selection and falls back safely for old or unsupported preferences', () => {
    expect(resolveLanguage('cs', ['de-DE'])).toBe('cs');
    expect(resolveLanguage('auto', ['ja', 'ko'])).toBe('en');
    expect(resolveLanguage('auto', [])).toBe('en');
    expect(resolveLanguage('../../other', ['pl-PL'])).toBe('pl');
    expect(isLanguagePreference('pt-BR')).toBe(true);
    expect(isLanguagePreference('pt')).toBe(false);
    expect(isLanguagePreference({})).toBe(false);
  });
});

describe('packaged translation catalogs', () => {
  for (const { code } of languages) {
    it(`${code} covers the English catalog and preserves interpolation and rich-text tags`, () => {
      const catalog = JSON.parse(readFileSync(`public/locales/${code}.json`, 'utf8')) as Record<
        string,
        string
      >;
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort());
      for (const [key, value] of Object.entries(catalog)) {
        expect(typeof value, key).toBe('string');
        expect(value.trim(), key).not.toBe('');
        expect(placeholders(value), key).toEqual(placeholders(english[key]));
        expect(tags(value), key).toEqual(tags(english[key]));
      }
    });
  }
  it('uses i18next interpolation, literal punctuation in keys, and English fallback', async () => {
    const i18n = createInstance();
    const slovak = JSON.parse(readFileSync('public/locales/sk.json', 'utf8'));
    const partial = { ...slovak };
    delete partial['Settings'];
    await i18n.init({
      lng: 'sk',
      fallbackLng: 'en',
      keySeparator: false,
      nsSeparator: false,
      resources: { en: { translation: english }, sk: { translation: partial } },
      interpolation: { escapeValue: false },
    });
    expect(i18n.t('Settings')).toBe('Settings');
    expect(i18n.t('Next: episode {{episode}}', { episode: 7 })).toBe('Ďalšia: epizóda 7');
    expect(i18n.t('Matched on MyAnimeList')).toBe('Priradené na MyAnimeList');
  });
  it('uses language-specific plural rules for episode counts', async () => {
    const i18n = createInstance();
    const resources = Object.fromEntries(
      languages.map(({ code }) => [
        code,
        {
          translation: JSON.parse(readFileSync(`public/locales/${code}.json`, 'utf8')),
        },
      ]),
    );
    await i18n.init({ lng: 'cs', fallbackLng: 'en', resources, keySeparator: false });
    expect(i18n.t('episodes', { count: 1 })).toBe('epizoda');
    expect(i18n.t('episodes', { count: 2 })).toBe('epizody');
    expect(i18n.t('episodes', { count: 5 })).toBe('epizod');
    await i18n.changeLanguage('pl');
    expect(i18n.t('episodes', { count: 1 })).toBe('odcinek');
    expect(i18n.t('episodes', { count: 2 })).toBe('odcinki');
    expect(i18n.t('episodes', { count: 21 })).toBe('odcinków');
  });
});
