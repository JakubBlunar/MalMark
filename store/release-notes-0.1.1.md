# Malmark 0.1.1

## Release notes

Fixed manual and automatic anime matching for titles hidden by MyAnimeList's default search filter, including some PG-13 ecchi series such as Magical★Explorer.

## Reviewer update note

This patch adds `nsfw=true` to the existing MyAnimeList anime-search request so matching can find titles omitted by the API's default filter. MyAnimeList's NSFW classification is separate from its age rating; Magical★Explorer (anime ID 56733) is returned as `rating: pg_13` and `nsfw: gray`. Both manual and automatic matching use this search request. A regression test covers the manual-search message path. There are no new permissions, hosts, dependencies, or data-collection changes.

The matching source archive includes `BUILD-FOR-REVIEW.md` with reproducible build instructions. Existing sign-in and functional testing instructions are in `store/reviewer-notes.md`; retain the private test credentials already supplied in the store dashboard.

## Store uploads

Update the existing listings to version 0.1.1:

- Chrome Web Store: upload `malmark-0.1.1-chromium.zip` as the extension package.
- Firefox Add-ons: upload `malmark-0.1.1-firefox.zip` as the extension package and `malmark-0.1.1-reviewer-source.zip` as its source code.

The versioned files are prepared in `artifacts/0.1.1/`. Paste the release notes above into the version's release-notes field where available, and use the reviewer update note for reviewer comments. The existing listing text, screenshots, and privacy disclosures still apply.
