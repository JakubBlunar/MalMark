# Malmark privacy

Malmark stores OAuth credentials, profile information, preferences, per-domain CSS selectors, MAL matching rules and pending episode updates in the browser’s extension storage. Credentials are not synced to another browser or device. Active playback sessions use session storage. Pending updates expire after seven days.

Connecting sends authentication requests to MyAnimeList. Detecting an anime sends its title to the official MAL API to search for a match. Manual searches, profile/detail requests and approved list updates also go to MAL. Cover/profile images are loaded from URLs returned by MAL. There is no analytics service or Malmark backend.

GitHub/unpacked builds ask for your own public MAL client ID and keep it in local extension storage. Store builds bundle the publisher’s public client ID. Each person signs in to their own MyAnimeList account and receives separate account tokens. A client ID does not grant access to anyone’s list on its own, and no client secret is shipped or requested.

Built-in access is limited to Crunchyroll and MAL. Crunchyroll is the only built-in streaming integration. Netflix and other websites require an explicit domain permission and selector setup; embedded players require separate optional domain access. Optional permission patterns in the manifest permit requesting a specific HTTPS origin, but do not grant access to every website.

Only extension UI pages can approve a MAL list change. The content scripts read selected title/episode elements and accessible HTML5 playback state; they never receive OAuth tokens. The in-page prompt opens the extension review UI. A website setup session can save selectors only for its original tab and origin with a short-lived setup nonce.

Use **Disconnect account** to remove stored credentials, session data and queued updates. Your public client ID, saved matches and website configurations remain available locally; edit the client ID from the sign-in screen, and remove matches and websites under **Matches** and **Sites**. Player permissions can be removed in **Settings**. Uninstalling Malmark removes its extension storage. Reload already-open pages after removing a site or player permission to unload injected scripts.
