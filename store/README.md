# Store submission kit

Descriptions, screenshots and account disclosures are uploaded in the store dashboards. The extension ZIP supplies its manifest name, short description, permissions and icons; it does not upload the long listing or screenshots for you. [Chrome listing fields](https://developer.chrome.com/docs/webstore/cws-dashboard-listing), [Firefox submission](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/).

1. Complete the privacy, permission and reviewer checks below before submitting.
2. Run `npm run package:store`. Upload `artifacts/malmark-store-chromium.zip` to Chrome and `malmark-store-firefox.zip` to AMO. AMO also needs the generated `malmark-store-reviewer-source.zip`.
3. Run `npm run store:assets`. Images appear in `artifacts/store/`, with a contact sheet and image manifest. This captures the real extension UI using clearly marked sample data and original artwork.
4. Run `npm run verify:review` to extract the reviewer ZIP into a clean directory, install pinned dependencies from the local npm cache and compare a fresh build with both store ZIPs. Run `npm run store:check` for metadata, source contents and image sizes. These are preparation checks, not store approval.
5. Copy the descriptions from this folder and metadata from [listing.json](listing.json). Use [reviewer-notes.md](reviewer-notes.md) for reviewer instructions.

Use `firefoxName` for the Firefox listing and `name` for Chrome. The Firefox name is kept within the 30-character submission limit.

The local `dist/chromium` manifest can contain the draft's public `key` to keep the store ID during unpacked OAuth testing. The Chromium store-upload ZIP always omits that field; Chrome Web Store assigns its identity. If a draft is deleted, create the replacement using the upload ZIP, then configure its new public key and MAL callback before retesting sign-in.

Chrome images: 128×128 icon, five 1280×800 screenshots, optional 440×280 small promo and 1400×560 marquee. Firefox: 64×64 icon and five 1280×800 screenshots without promotional text overlays. [Chrome image guidance](https://developer.chrome.com/docs/webstore/images), [Mozilla listing guidance](https://extensionworkshop.com/documentation/develop/create-an-appealing-listing/).

The contact sheet is a 5264×3344, 2×2 overview of the first four screenshots, composed from native 2560×1600 captures. All five high-resolution originals are in `artifacts/store/high-resolution/`; store-upload screenshots retain their required sizes. The listing-assets ZIP includes the contact sheet and high-resolution copies too.

Do not upload debug profiles, `.env`, GitHub/unpacked ZIPs, or the reviewer-source ZIP as the installable extension. The source ZIP contains only the public app configuration needed to reproduce the store build. Source copies must accompany each AMO version. [Source submission requirements](https://extensionworkshop.com/documentation/publish/source-code-submission/).

Optional native smoke check: set `MALMARK_FIREFOX_PATH` to the installed Firefox executable and run `npm run test:firefox-smoke`. It uses an isolated headless profile and checks temporary installation/background startup and the actual Firefox OAuth callback. Add that callback to the MAL app alongside Chrome’s redirect before testing Firefox login.
