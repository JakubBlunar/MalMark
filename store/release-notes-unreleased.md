# Unreleased

## Release notes

Custom website selectors can now be edited in the picker and in Sites across the popup, sidebar, and options page. The picker previews matched text as you type. Saved selectors can be tested on an open watch page, with CSS validation and match counts before saving; saved changes apply to open pages on that domain.

Added on-page prompts when an anime needs a manual match or an embedded player needs domain access. Player access can be granted directly from the prompt and is also shown near the top of Malmark.

Unmatched titles now try a few shorter searches. The first search with results is prefilled with its candidates; when no search succeeds, the full title stays prefilled. Automatic selection still requires a matching title or alias, and sequel/part markers are retained.

Firefox now requires desktop version 142 or later.

Fixed custom website setup requiring a second click after granting domain access. The picker now continues from the background even if the browser closes Malmark's popup during the permission prompt.

Improved custom title and episode selectors to use stable surrounding elements, so a plain tag such as `<b>` does not accidentally match unrelated text elsewhere on the page. Existing saved selectors can be edited in Sites or replaced by running website setup again.

## Reviewer update note

Raised Firefox's minimum from 140.0 to 142.0 to resolve the data-consent manifest compatibility warning. Android support remains undeclared. There are no permission, dependency, or data-collection changes.

The two remaining `UNSAFE_VAR_ASSIGNMENT` warnings come from React DOM's unused `dangerouslySetInnerHTML` handling for standard and custom elements. React is bundled unchanged; Malmark renders external text through React/textContent. See [reviewer-notes.md](reviewer-notes.md).

These changes are prepared for a future release. Choose and bump the version, then generate matching extension and reviewer-source ZIPs when ready to release.
