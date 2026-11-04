import i18next from 'i18next';
import Backend from 'i18next-http-backend';
import type Browser from 'webextension-polyfill';
import type { Reply } from './types';
import {
  isLanguagePreference,
  languages,
  languageStorageKey,
  resolveLanguage,
  type LanguagePreference,
} from './localization';

export const i18n = i18next.createInstance();
// Non-React helpers and content scripts share the same i18next instance.
export const t = (message: string, values?: Record<string, string | number>): string =>
  i18n.isInitialized ? i18n.t(message, values) : message;

let browser: typeof Browser | undefined;
let preference: LanguagePreference = 'auto';
let hasPreference = false;
let initialized: Promise<void> | undefined;
let sequence = 0;
let saving: LanguagePreference | undefined;
const listeners = new Set<() => void>();
const preferredLanguages = () =>
  navigator.languages?.length ? navigator.languages : [navigator.language];
export const getLanguagePreference = () => preference;
export const getHasLanguagePreference = () => hasPreference;
export const subscribeLanguagePreference = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

async function apply(
  next: LanguagePreference,
  persist = false,
  explicitlyChosen = true,
): Promise<void> {
  const revision = ++sequence;
  const language = resolveLanguage(next, preferredLanguages());
  if (!i18n.hasResourceBundle(language, 'translation')) {
    // Explicit reload also lets a user retry a failed packaged-file read.
    await i18n.reloadResources(language, 'translation');
    if (!i18n.hasResourceBundle(language, 'translation'))
      throw new Error('Could not load this language.');
  }
  if (revision !== sequence) return;
  if (persist) {
    saving = next;
    try {
      if (browser) await browser.storage.local.set({ [languageStorageKey]: next });
      else localStorage.setItem(languageStorageKey, next);
    } finally {
      saving = undefined;
    }
  }
  if (revision !== sequence) return;
  preference = next;
  hasPreference = explicitlyChosen;
  await i18n.changeLanguage(language);
  listeners.forEach((listener) => listener());
}

export const setLanguage = (next: LanguagePreference) => apply(next, true);

export function initializeI18n(
  extensionContext = !!(globalThis as { chrome?: { runtime?: { id?: string } } }).chrome?.runtime
    ?.id,
  contentContext = false,
): Promise<void> {
  return (initialized ??= (async () => {
    let saved: unknown;
    try {
      if (extensionContext) {
        browser = (await import('webextension-polyfill')).default;
        if (contentContext) {
          const response = (await browser.runtime.sendMessage({
            type: 'GET_LANGUAGE_PREFERENCE',
          })) as Reply<LanguagePreference>;
          saved = response?.ok ? response.data : 'auto';
          browser.runtime.onMessage.addListener(
            (message: unknown, sender: Browser.Runtime.MessageSender) => {
              if (
                sender.id !== browser!.runtime.id ||
                sender.tab ||
                !message ||
                typeof message !== 'object'
              )
                return;
              if (
                'type' in message &&
                message.type === 'LANGUAGE_CHANGED' &&
                'preference' in message
              ) {
                const next = isLanguagePreference(message.preference) ? message.preference : 'auto';
                void initialized?.then(() => apply(next)).catch(() => undefined);
              }
            },
          );
        } else {
          saved = (await browser.storage.local.get(languageStorageKey))[languageStorageKey];
          browser.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes[languageStorageKey]) {
              const value: unknown = changes[languageStorageKey].newValue;
              const next = isLanguagePreference(value) ? value : 'auto';
              if (next !== saving)
                void initialized
                  ?.then(() => apply(next, false, isLanguagePreference(value)))
                  .catch(() => undefined);
            }
          });
        }
      } else {
        saved = localStorage.getItem(languageStorageKey);
        window.addEventListener('storage', (event) => {
          if (event.key === languageStorageKey || event.key === null)
            void initialized
              ?.then(() =>
                apply(
                  isLanguagePreference(event.newValue) ? event.newValue : 'auto',
                  false,
                  isLanguagePreference(event.newValue),
                ),
              )
              .catch(() => undefined);
        });
      }
    } catch {
      /* A storage failure must not prevent sign-in. */
    }
    preference = isLanguagePreference(saved) ? saved : 'auto';
    hasPreference = isLanguagePreference(saved);
    await i18n.use(Backend).init({
      lng: resolveLanguage(preference, preferredLanguages()),
      fallbackLng: 'en',
      supportedLngs: languages.map(({ code }) => code),
      load: 'currentOnly',
      // English source text is also a safe fallback if a packaged file cannot load.
      keySeparator: false,
      nsSeparator: false,
      interpolation: { escapeValue: false },
      backend: {
        loadPath: (locales: readonly string[]) => {
          const path = `locales/${locales[0]}.json`;
          return browser
            ? browser.runtime.getURL(path)
            : extensionContext
              ? 'about:blank'
              : new URL(path, document.baseURI).href;
        },
      },
      maxRetries: 0,
    });
    window.addEventListener('languagechange', () => {
      if (preference === 'auto') void apply('auto', false, hasPreference).catch(() => undefined);
    });
  })());
}
