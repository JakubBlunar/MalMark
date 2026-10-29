# Malmark

A browser extension for Chrome, Brave and Firefox that detects the anime you’re watching and helps keep your MyAnimeList progress up to date. Updates require confirmation by default; automatic next-episode progress is optional.

- Crunchyroll support built in, with manual matching and episode offsets.
- A persistent sidebar, popup, profile, and watch settings.
- Playback tracking that accounts for speed changes and skipped scenes.
- Partial episode progress survives page refreshes and browser restarts, including episodes already logged on MAL; old checkpoints expire after 30 days (100 episodes maximum).
- Restored/activated tabs and opening Malmark retry tracker connections. The badge shows ✓ for a match with recent player data, or … while waiting for the player.
- Manual watched-count controls and reminders that survive autoplay.
- Update progress directly from an episode reminder, or choose Later to keep it queued in Malmark.
- Saving episode progress adds missing titles to Currently Watching and moves Plan to Watch or On Hold titles there. Completed and Dropped keep their status.
- Opt into automatic progress for exactly the next episode after the saved count, or episode 1 of a new title, with a four-second success notice. Completed and Dropped retain their status. Gaps, On Hold and failed updates stay queued for confirmation; completion and scores remain manual.
- Rewatching a fully logged title leaves its MAL episode total untouched. Manually saving a lower count resets later playback checkpoints and reminders so tracking can continue from that count. MAL's explicit rewatch mode remains managed on MyAnimeList.
- Complete and optionally score finished-airing anime after the final episode.
- Enable **Set finish date automatically** in Settings to fill a missing MAL finish date with your local calendar date when marking an anime Completed. Existing dates are preserved; ordinary episode logging does not change dates.
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

Previews support `?demo=watching`, `?demo=pending`, `?demo=unmatched`, `?demo=finished` and `?demo=finale`; extension actions are disabled there. Browser tests use isolated profiles and fixture data. Set `MALMARK_BROWSER_PATH` for Brave or `MALMARK_CHROME_PATH` for the optional installed-Chrome checks. Live streaming/account behavior still needs manual verification.

The UI is organized into `src/ui/views`, `components`, `hooks`, `services`, and `styles`. Other code lives in `src/content` (detection/player/picker), `src/background` (MAL, permissions, storage), and `src/shared`. `scripts/build.mjs` creates the browser-specific manifests and generates dependency notices from the bundled modules.

## MyAnimeList OAuth

Default builds and GitHub release ZIPs use each user’s own public client ID, entered on the sign-in screen. No `.env` is needed. The callback is read from the browser, so it matches the installed extension. Unpacked Chromium IDs can change when the folder moves; update the registered callback through **Edit API setup** if needed. Firefox uses the explicit ID `malmark@mal-episode-watcher.local`.

For local store submissions, copy `.env.example` to `.env`, set `VITE_MAL_CLIENT_ID` for your public MAL app of type **Other**, and run `npm run package:store`. This creates `artifacts/malmark-store-chromium.zip` and `malmark-store-firefox.zip` with direct sign-in. Finalize the store extension identity and register its callback before publishing. Never include a client secret. `npm run build:store` builds the same profile without ZIPs.

## Releases

Store listing copy, image generation, privacy declarations and the submission checklist are in [store/README.md](store/README.md).

Push a version tag matching `package.json`, such as `v0.1.0`. After checks pass, GitHub Actions publishes a Release with `malmark-chromium.zip` and `malmark-firefox.zip`, both using API setup. Pull requests run checks only; ordinary pushes to `main` do not publish or upload packages. The ZIPs are unsigned; Firefox requires signing for permanent installation. Store bundles are built locally with `npm run package:store`.

## License and privacy

Malmark’s own code is source-available under [Elastic License 2.0](LICENSE). Dependencies keep their respective licenses. Their notices are generated automatically and included alongside the license in each extension package. See [PRIVACY.md](PRIVACY.md) for stored data and domain permissions. Malmark is an independent project and is not affiliated with MyAnimeList or Crunchyroll.
