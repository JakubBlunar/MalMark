import { releases } from '../../shared/changelog.json';
import { compareVersions, version } from '../../shared/releases';

// Import only versioned notes; the unreleased draft is not shipped in the UI bundle.
export const installedReleases = releases
  .filter((release) => compareVersions(release.version, version) <= 0)
  .slice(0, 4);
