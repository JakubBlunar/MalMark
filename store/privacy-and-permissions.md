# Dashboard privacy and permission entries

These are project-specific drafts based on the source, not completed store forms. Check that the submitted build still matches them. A public privacy-policy URL is required; publish the current PRIVACY.md before using its listing URL. [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy).

## Single purpose

Help users track anime episodes they watch and approve updates to their own MyAnimeList list.

## Permission justifications

| Permission                              | Paste-ready explanation                                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| storage                                 | Store OAuth tokens, profile, preferences, per-domain selectors, saved anime matches, pending episode approvals and bounded playback checkpoints locally. No browser sync is used.                                               |
| identity                                | Open the MyAnimeList OAuth authorization flow and receive the browser-generated callback. The extension uses PKCE and does not request a MAL password or bundle a client secret.                                                |
| scripting                               | Inject the packaged player tracker into permitted player frames, and the packaged selector picker into websites explicitly added by the user. No downloaded scripts or user-written JavaScript are executed.                    |
| webNavigation                           | Identify and reconnect permitted player frames after navigation, and clear tab-specific detection when a watch page changes. Unrelated browsing is not saved or sent to a backend.                                              |
| activeTab                               | Read the current tab URL after the user opens Malmark, so it can offer website setup without a broad required tabs permission.                                                                                                  |
| sidePanel (Chrome only)                 | Let the user keep Malmark’s watch session and approval controls beside the active video tab.                                                                                                                                    |
| Crunchyroll hosts                       | Read anime/episode labels and accessible HTML5 playback timing for the built-in integration.                                                                                                                                    |
| myanimelist.net and api.myanimelist.net | Authorize the user's MAL account, search anime, read the user's profile/list status and send list changes the user approves.                                                                                                    |
| Optional https://_/_                    | Support the user's existing ability to add an arbitrary HTTPS anime site or embedded player. At runtime the extension requests only the exact origin selected by the user; it does not request this wildcard as a global grant. |

## Data categories

Do **not** claim that no user data is handled just because there is no Malmark server.

For Chrome, disclose profile/account identifiers, authentication information, supported-page URLs/history, website content (selected titles/episode labels), and user activity (playback timing and approved watch-list actions). State that URLs/selectors/ranges remain local; titles/searches and approved counts/status/scores go directly to MAL. No location tracking, personal communications, payments, health data, advertising or analytics are implemented. Check the exact category wording shown in the dashboard before certifying.

Firefox already declares authenticationInfo, browsingActivity, websiteContent and websiteActivity. These cover the OAuth/MAL integration, supported-page context, title/episode extraction and approved watch progress. No optional telemetry is implemented. Its minimum desktop version is 140, which supports Firefox’s built-in consent. Recheck declarations if the data flow changes. [Mozilla taxonomy](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

## Remote code and limited use

Select **No remote code**: application JavaScript, React, icons and CSS are bundled. MAL API JSON and cover/profile images are data; none is executed as code. The selector picker stores CSS selectors, not executable scripts. A Limited Use statement is included in PRIVACY.md. Only certify the dashboard’s data-use statements after verifying them against the final code and your publishing practices. [Chrome data-use requirements](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
