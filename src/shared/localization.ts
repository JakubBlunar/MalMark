export const languages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Español' },
  { code: 'cs', name: 'Čeština' },
  { code: 'sk', name: 'Slovenčina' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'pt-BR', name: 'Português (Brasil)' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'pl', name: 'Polski' },
] as const;

export type Language = (typeof languages)[number]['code'];
export type LanguagePreference = Language | 'auto';
export const languageStorageKey = 'languagePreference';

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === 'auto' || languages.some(({ code }) => code === value);
}

export function resolveLanguage(preference: unknown, preferred: readonly string[]): Language {
  if (isLanguagePreference(preference) && preference !== 'auto') return preference;
  for (const tag of preferred) {
    const base = tag.toLowerCase().replaceAll('_', '-').split('-')[0];
    if (base === 'pt') return 'pt-BR';
    const language = languages.find(({ code }) => code === base);
    if (language) return language.code;
  }
  return 'en';
}
