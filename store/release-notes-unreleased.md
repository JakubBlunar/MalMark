# Unreleased

## Release notes

Firefox now requires desktop version 142 or later.

Fixed custom website setup requiring a second click after granting domain access. The picker now continues from the background even if the browser closes Malmark's popup during the permission prompt.

Improved custom title and episode selectors to use stable surrounding elements, so a plain tag such as `<b>` does not accidentally match unrelated text elsewhere on the page. Existing saved selectors can be replaced by running website setup again.

## Reviewer update note

Raised Firefox's minimum from 140.0 to 142.0 to resolve the data-consent manifest compatibility warning. Android support remains undeclared. There are no permission, dependency, or data-collection changes.

The two remaining `UNSAFE_VAR_ASSIGNMENT` warnings come from React DOM's unused `dangerouslySetInnerHTML` handling for standard and custom elements. React is bundled unchanged; Malmark renders external text through React/textContent. See [reviewer-notes.md](reviewer-notes.md).

These changes are prepared for a future release. Choose and bump the version, then generate matching extension and reviewer-source ZIPs when ready to release.
