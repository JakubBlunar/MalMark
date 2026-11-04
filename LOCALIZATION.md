# Localization

Malmark uses [i18next](https://www.i18next.com/),
[react-i18next](https://react.i18next.com/), and i18next-http-backend.

English, Spanish, Czech, Slovak, German, French, Brazilian Portuguese, Indonesian,
and Polish are included. The initial translations should receive native-speaker
review as they evolve.

## Language choice and loading

- On the first signed-out screen, the language choice appears above the welcome
  artwork. Continue accepts the detected language; choosing a language also saves
  the preference. The picker then appears beside the sign-in action (below it in
  narrow panels). Signed-in users can change it in Settings.
- Automatic follows `navigator.languages`, then `navigator.language`. Browsers
  normally inherit these from OS preferences, but users can override them in the
  browser. Regional variants use the supported base language; Portuguese uses the
  Brazilian Portuguese catalog. Unsupported preferences fall back to English.
- `languagePreference` is stored in extension-local storage, independently of
  login and tracking settings. Storage changes update other open surfaces.
- Catalogs live in `public/locales/<language>.json`. Vite copies them to each
  extension build. i18next-http-backend loads only the chosen catalog and English
  fallback, from packaged extension URLs. Catalogs are separate assets, never
  embedded in the initial JavaScript bundle or downloaded from a remote service.
  Already visited languages remain cached for that page’s lifetime.
- The same instance supports popup, sidebar, options, inline reminders, and the
  website picker. Content scripts do not change the host website’s language.
  Their catalogs load only when a Malmark prompt or picker is needed.
  Content scripts request only the language preference from the background and
  receive language-change notifications; they do not gain access to protected
  account storage.

## Editing copy

React components use the standard `useTranslation()` hook. Plain helpers use the
shared i18next instance from `src/shared/i18n.ts`. Do not translate anime titles,
account names, URLs, API identifiers, or CSS selectors.

English messages are literal keys (`keySeparator` and `nsSeparator` are disabled),
so punctuation is safe and untranslated messages have a readable fallback.
Keep the same keys in all nine files. For example:

```tsx
const { t } = useTranslation();
t('Next: episode {{episode}}', { episode: 7 });
```

Use named interpolation values and translate complete sentences so languages can
reorder them. Use `Trans` with named components for sentences containing emphasis
or links. React escapes values; do not insert translated HTML with
`dangerouslySetInnerHTML`. Use i18next plural suffixes (`_one`, `_other`, plus
`_few`/`_many` where required) and a numeric `count` for count-dependent nouns.
Format dates and numbers with `Intl` and `i18n.resolvedLanguage`.

Release-note articles retain their original editorial text. MyAnimeList responses,
browser permission dialogs, and low-level diagnostics can retain their original
language; the surrounding Malmark controls are translated.

## Adding a language

1. Add its code and native name in `src/shared/localization.ts`.
2. Copy `public/locales/en.json` to its language code and translate the values.
3. Preserve interpolation names and `Trans` component names.
4. Run `npm test` and `npm run test:e2e -- tests/e2e/localization.spec.ts` after a
   build. Catalog checks verify key coverage, placeholders, and rich-text tags.
5. Check welcome, settings, and longer help text at a 320-pixel sidebar width.

Native language names are used in the picker instead of country flags.
