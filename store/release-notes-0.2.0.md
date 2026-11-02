# Malmark 0.2.0

## Release notes

Added My list, a quick overview of titles marked Watching on MyAnimeList with episode progress and links to individual anime and the full list. English titles appear first, with the original title underneath when different. Settings now lives in the header beside the expand/sidebar control. Expanding the sidebar preserves the current view.

Opening Profile now refreshes MyAnimeList statistics without signing in again. Saved statistics remain visible while loading or if the refresh fails, with an option to retry.

Custom website selectors can now be edited in the picker and in Sites across the popup, sidebar, and options page. The picker previews matched text as you type. Saved selectors can be tested on an open watch page, with CSS validation and match counts before saving; saved changes apply to open pages on that domain.

Added on-page prompts when an anime needs a manual match or an embedded player needs domain access. Player access can be granted directly from the prompt and is also shown near the top of Malmark.

Dismissed prompts stay dismissed even when an older background response arrives late.

Unmatched titles now try a few shorter searches. The first search with results is prefilled with its candidates; when no search succeeds, the full title stays prefilled. Automatic selection still requires a matching title or alias, and sequel/part markers are retained.

Firefox now requires desktop version 142 or later.

Fixed custom website setup requiring a second click after granting domain access. The picker now continues from the background even if the browser closes Malmark's popup during the permission prompt.

Improved custom title and episode selectors to use stable surrounding elements, so a plain tag such as `<b>` does not accidentally match unrelated text elsewhere on the page. Existing saved selectors can be edited in Sites or replaced by running website setup again.

## Reviewer update note

My list reads the signed-in account's Watching entries through the existing official MAL API connection, including paginated list status and episode counts. The overview is held in the open UI, not persisted to extension storage. Profile statistics refresh on entry and preserve cached data on failure. Neither feature writes to MAL. Requests are account-scoped and stale responses are rejected after logout or account changes. The privacy policy now explicitly describes the list overview.

Custom selectors can be edited and tested from the extension UI. Saving changes refreshes open pages only on the configured origin. The setup picker also supports manual CSS entry and previews. Optional host permissions remain per-domain; pending picker setup resumes through the background permission event if the browser closes the popup. On-page player-access prompts require a user click for the native permission request. Unmatched-title searches use a bounded set of shorter queries; automatic matches still require the original title or alias, with season/part markers preserved.

Raised Firefox's minimum from 140.0 to 142.0 to resolve the data-consent manifest compatibility warning. Android support remains undeclared. There are no new permissions, host patterns, dependencies, third-party recipients, or declared data-collection categories.

The two remaining `UNSAFE_VAR_ASSIGNMENT` warnings come from React DOM's unused `dangerouslySetInnerHTML` handling for standard and custom elements. React is bundled unchanged; Malmark renders external text through React/textContent. See [reviewer-notes.md](reviewer-notes.md).

The matching source archive includes BUILD-FOR-REVIEW.md and public reviewer-config.json. Existing sign-in and functional testing instructions are in [reviewer-notes.md](reviewer-notes.md); retain the private test credentials already supplied through the store dashboard.

## Store uploads

Update the existing listings to version 0.2.0:

- Chrome Web Store: upload `malmark-0.2.0-chromium.zip` as the extension package.
- Firefox Add-ons: upload `malmark-0.2.0-firefox.zip` as the extension package and `malmark-0.2.0-reviewer-source.zip` as its source code.

The versioned files are prepared in `artifacts/0.2.0/`. Use the release notes above in the version's release-notes field and the reviewer update note for reviewer comments. Updated description text is in `store/chrome-description.txt` and `store/firefox-description.txt`. The Firefox listing must state the new desktop minimum of 142. Update the hosted privacy policy with the prepared PRIVACY.md when publishing this version.
