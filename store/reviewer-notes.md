# Reviewer notes

Malmark is an independent MyAnimeList tracker with Crunchyroll detection and optional per-domain selector setup. Desktop only is the initial review target. MAL login is required; Crunchyroll content may require a separate subscription.

Supply a dedicated MAL test account privately through the store's reviewer/test-instructions fields. Do not put its credentials here or in the source ZIP. Provide authorized streaming test access privately if requested; do not share your personal streaming account. Account-dependent functionality still requires live testing and cannot be established by the automated mock tests alone. [Mozilla testing requirement](https://extensionworkshop.com/documentation/publish/add-on-policies/).

## Build and source

Upload the source ZIP generated together with this exact store build. Its root BUILD-FOR-REVIEW.md and reviewer-config.json contain the build instructions and public configuration. `npm ci` then `npm run build:review` reproduces `dist/firefox` and `dist/chromium`. No private environment variables or credentials are required. Dependencies are installed unmodified from npm; bundling/minification explains the generated code. [AMO reproducible sources](https://extensionworkshop.com/documentation/publish/source-code-submission/).

The two current web-ext `UNSAFE_VAR_ASSIGNMENT` warnings are in the unmodified bundled React DOM runtime. Application code does not use innerHTML, dangerouslySetInnerHTML, eval or remote scripts; page titles and other text are rendered through React/textContent. The source package and pinned dependencies let reviewers inspect the original code. These warnings are disclosed, not suppressed or presented as approval.

There is also a `KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION` warning: this desktop-only build omits gecko_android, but the installed linter's `androidStrictMinVersion()` falls back to gecko.strict_min_version (140). Firefox's built-in desktop consent supports version 140; Android is not a supported platform in this release. See the [platform declaration guidance](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings). Do not mark Android compatible to work around this warning.

## Manual functional walkthrough

1. Install the store build. Confirm that first run offers MyAnimeList sign-in directly, rather than requiring API-app setup. Authorize the dedicated test account.
2. Open an authorized Crunchyroll episode. Open the popup or sidebar. Verify detected series/season/episode; use Matches if necessary. Confirm that merely detecting or playing makes no list change.
3. Add a new matched anime to Currently Watching only by pressing its explicit action. Play normally, then skip ahead; verify that the skip is not counted as watched time. A 1.25× speed change should count media time correctly.
4. Partway through an episode, close the browser and reopen it. Verify partial progress returns for that matched episode without credit for offline time. The reminder is queued when the configured coverage/end condition is reached.
5. Let autoplay change episodes. Review the queued previous episode and approve its update. Check the MAL list. Try manual watched-count adjustment separately.
6. For a Finished Airing entry with a known episode count, approve the final episode and use Complete & rate. Completion is user-triggered; the backend rechecks eligibility. Leaving the score unchanged preserves it.
7. On a suitable HTTPS test page, use Sites to grant just that domain and pick stable title/episode elements. For cross-origin players, grant the player origin only when requested. Removing the configuration removes its permission and local progress; reload the page to unload injected code.
8. Disconnect. Tokens, queued updates and playback checkpoints are removed. Saved mappings/selectors remain until explicitly removed or the extension is uninstalled.

Automated tests use isolated browser profiles and mocked MAL/streaming responses. They are available in tests/ for diagnostics, not a substitute for the live walkthrough above. Store screenshots use the actual extension UI with fictional, marked sample data and original artwork; no copyrighted streaming frames are included.
