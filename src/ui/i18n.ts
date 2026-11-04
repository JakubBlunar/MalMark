import { useSyncExternalStore } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';
import {
  i18n,
  initializeI18n,
  getLanguagePreference,
  getHasLanguagePreference,
  subscribeLanguagePreference,
  setLanguage,
} from '../shared/i18n';

i18n.use(initReactI18next);
export { initializeI18n };

export function useLanguagePreference() {
  const { t } = useTranslation();
  const preference = useSyncExternalStore(subscribeLanguagePreference, getLanguagePreference);
  const hasPreference = useSyncExternalStore(subscribeLanguagePreference, getHasLanguagePreference);
  return { t, preference, hasPreference, setLanguage };
}
