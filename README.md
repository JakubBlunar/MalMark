# Malmark

A browser extension for Chrome, Brave and Firefox that detects the anime you’re watching and helps keep your MyAnimeList progress up to date. Every list change needs your approval.

- Crunchyroll support built in, with manual matching and episode offsets.
- A persistent sidebar, popup, profile, and watch settings.
- Playback tracking that accounts for speed changes and skipped scenes.
- Manual watched-count controls and reminders that survive autoplay.
- A selector picker for websites you choose to add, with permission per domain.

GitHub downloads start with API setup: create a MyAnimeList app of type **Other**, register the exact redirect URL shown by Malmark, and paste its public client ID. Then sign in, open an episode, and confirm updates when ready. Use **Open sidebar** in the header to keep Malmark beside your video. The sidebar follows the active tab.

## Development

Use Node.js 24 LTS and npm.

```sh
npm ci
npm run build
```

Load `dist/chromium` as an unpacked extension in Chrome/Brave, or load `dist/firefox/manifest.json` as a temporary add-on through Firefox’s `about:debugging`. Reload watch pages after rebuilding. Firefox’s permanent distribution requires signing.

```sh
npm run dev           # Local UI previews: /popup.html, /sidebar.html, /options.html
npm run typecheck
npm run format:check
npm test
npm run test:e2e      # Run after building; install Chromium with npx playwright install chromium
npm run lint:firefox
npm run package      # Browser ZIPs in artifacts/
```

Previews support `?demo=watching`, `?demo=pending` and `?demo=unmatched`; extension actions are disabled there. Browser tests use isolated profiles and fixture data. Set `MALMARK_BROWSER_PATH` for Brave or `MALMARK_CHROME_PATH` for the optional installed-Chrome checks. Live streaming/account behavior still needs manual verification.

The UI is organized into `src/ui/views`, `components`, `hooks`, `services`, and `styles`. Other code lives in `src/content` (detection/player/picker), `src/background` (MAL, permissions, storage), and `src/shared`. `scripts/build.mjs` creates the browser-specific manifests and generates dependency notices from the bundled modules.

## MyAnimeList OAuth

Default builds and GitHub release ZIPs use each user’s own public client ID, entered on the sign-in screen. No `.env` is needed. The callback is read from the browser, so it matches the installed extension. Unpacked Chromium IDs can change when the folder moves; update the registered callback through **Edit API setup** if needed. Firefox uses the explicit ID `malmark@mal-episode-watcher.local`.

For local store submissions, copy `.env.example` to `.env`, set `VITE_MAL_CLIENT_ID` for your public MAL app of type **Other**, and run `npm run package:store`. This creates `artifacts/malmark-store-chromium.zip` and `malmark-store-firefox.zip` with direct sign-in. Finalize the store extension identity and register its callback before publishing. Never include a client secret. `npm run build:store` builds the same profile without ZIPs.

## Releases

Push a version tag matching `package.json`, such as `v0.1.0`. After checks pass, GitHub Actions publishes a Release with `malmark-chromium.zip` and `malmark-firefox.zip`, both using API setup. Pull requests run checks only; ordinary pushes to `main` do not publish or upload packages. The ZIPs are unsigned; Firefox requires signing for permanent installation. Store bundles are built locally with `npm run package:store`.

## License and privacy

Malmark’s own code is source-available under [Elastic License 2.0](LICENSE). Dependencies keep their respective licenses. Their notices are generated automatically and included alongside the license in each extension package. See [PRIVACY.md](PRIVACY.md) for stored data and domain permissions. Malmark is an independent project and is not affiliated with MyAnimeList or Crunchyroll.
