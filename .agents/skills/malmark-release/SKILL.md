---
name: malmark-release
description: Maintain Malmark’s public changelog as user-facing changes are made, and prepare versioned release notes and builds. Use for Malmark feature or fix work, changelog updates, and release preparation; exclude purely internal refactors with no user-visible change.
---

# Malmark changelog and releases

Work from the Malmark repository root. `src/shared/changelog.json` is the source for public notes; the installed UI uses only versioned entries matching the build, never `unreleased`. `CHANGELOG.md` and `store/release-notes-unreleased.md` are generated from that source.

## Maintain notes during feature and fix work

- Review the actual diff and relevant history, then add or refine a concise note in `unreleased.sections`. Merge repeated changes into one useful user-facing description. Use headings such as Added, Improved, Fixed, or Compatibility when they fit.
- Describe what users can now do or what changed. Keep reviewer instructions, implementation details, test output, credentials, and publishing/account information out of public notes. Historical store files contain separate reviewer sections; do not copy those into the public changelog.
- Keep completed version entries intact unless correcting a verified error. Do not assign the draft a version during ordinary development.
- Run `npm run changelog:write` after editing the source, then `npm run changelog:check`. The build also checks version and generated-note consistency.

## Prepare a release

- Read `package.json`, the unreleased draft, and `store/README.md`. Confirm that the draft describes the changes actually included. Use the version requested by the user; if none is provided for a release, ask for the intended version before assigning it.
- Run `npm run release:prepare -- <version>`. This moves the draft into history, resets Unreleased, updates the package and lockfile versions, regenerates the Markdown changelogs, and writes `store/release-notes-<version>.md`. It rejects empty drafts, older versions, and existing note files.
- Add reviewer-specific information separately when needed. The command creates public release notes only.
- Run checks appropriate to the change and build using `npm run package:store` for store submissions or `npm run package` for GitHub/unpacked distribution. Normal builds never change the version.
- Check the resulting manifests, footer version, and release notes agree. Packaging writes the public notes to `artifacts/malmark-release-notes.md`; tagged GitHub releases use that file. Keep the matching Firefox reviewer source archive with store artifacts.
- Report the prepared version, artifact locations, and verification results. Preparing a build does not itself submit to stores, push a tag, or publish a release; perform those actions only within the user’s requested scope.

## Verify the user experience when changing it

Settings → What’s new shows the installed release and up to three previous releases. Clicking the footer version opens this section. Updates highlight the version until the notes are opened; fresh installs and same-version reloads do not introduce an update highlight. Read state is local, shared by popup/sidebar/options, and independent of MyAnimeList login. Keep Unreleased notes out of installed release history. Focused checks are in `tests/release-notes.test.ts`, `tests/changelog.test.mjs`, and `tests/e2e/release-notes.spec.ts`.
