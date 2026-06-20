/**
 * Version tracking and backward compatibility utilities for @jawi/core.
 *
 * Exports:
 *   getVersion()       - current package version from package.json
 *   getApiVersion()    - API compatibility version (separate from semver)
 *   BREAKING_CHANGES   - array of breaking change records per version
 */

import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

/**
 * Read the current package version from package.json.
 * @returns {string} Semver version string (e.g. "1.0.0")
 */
export function getVersion() {
  const { version } = require('../package.json');
  return version;
}

/**
 * API compatibility version. Incremented when the public API surface changes
 * in non-breaking ways (new functions, new config options). Separate from
 * the semver package version so consumers can check API availability without
 * parsing semver.
 *
 * @returns {number} Monotonically increasing integer
 */
export function getApiVersion() {
  return 1;
}

/**
 * Array of breaking change records, ordered newest-first.
 * Each record describes what changed and how to migrate.
 *
 * Shape:
 *   {
 *     version: string,           // semver version where the break was introduced
 *     changes: Array<{
 *       type: 'renamed' | 'removed' | 'changed' | 'added_required',
 *       from?: string,           // previous API surface
 *       to?: string,             // new API surface
 *       description: string      // human-readable explanation
 *     }>
 *   }
 */
export const BREAKING_CHANGES = [
  {
    version: '1.1.0',
    changes: [
      {
        type: 'changed',
        from: 'tags stored with "#" prefix in frontmatter',
        to: 'tags stored without "#" prefix in frontmatter',
        description: 'Tag format changed: frontmatter tags no longer include "#" prefix. Tags are now displayed with "#" in HTML output (rendering layer). Existing content files with "#" prefix continue to work (rendering detects and handles both formats). New content created with create-post/create-code/create-thought will use the new format.',
        migration: 'Optional: run `jawi migrate tags` to strip "#" prefix from existing content files. Or manually edit frontmatter to remove "#" from tag values. No action required — rendering is backward compatible.',
      },
      {
        type: 'changed',
        from: 'create-code --tags used comma-separated values',
        to: 'create-code --tags uses space-separated values',
        description: 'The create-code CLI now uses space-separated tags (consistent with create-post and create-thought).',
        migration: 'Update any scripts that pass comma-separated tags to create-code to use space-separated values instead.',
      },
      {
        type: 'changed',
        from: 'code pages rendered tags as <span> elements',
        to: 'code pages render tags as <a> links',
        description: 'Code snippet pages now render tags as clickable links to tag pages (consistent with posts and thoughts).',
        migration: 'If you have overridden src/pages/codes/[slug].astro or src/pages/codes/index.astro, update the tag rendering to use <a> elements with href="/tags/{slug}". Run `jawi diff page codes/[slug]` and `jawi diff page codes/index` to see differences.',
      },
    ],
  },
  {
    version: '1.0.0',
    changes: [
      {
        type: 'new',
        description: 'Initial framework extraction. Content finders now accept baseDir parameter.',
        migration: 'Update finder calls to pass content directory: findPosts(contentDir).',
      },
      {
        type: 'renamed',
        from: 'import.meta.env.PUBLIC_TIMEZONE',
        to: 'config.display.timezone',
        description: 'Environment variables replaced by jawi.config.mjs.',
        migration: 'Create jawi.config.mjs with display.timezone setting.',
      },
      {
        type: 'renamed',
        from: 'import.meta.env.PUBLIC_DATE_FORMAT',
        to: 'config.display.dateFormat',
        description: 'Date format now configured via jawi.config.mjs.',
        migration: 'Create jawi.config.mjs with display.dateFormat setting.',
      },
    ],
  },
];

/**
 * Get breaking changes that were introduced between the installed version
 * and the target version. Returns changes where version > installedVersion.
 *
 * @param {string} installedVersion - Currently installed semver version
 * @param {string} targetVersion    - Target semver version (e.g. latest from npm)
 * @returns {Array} Breaking change records affecting the upgrade path
 */
export function getBreakingChangesBetween(installedVersion, targetVersion) {
  if (compareSemver(installedVersion, targetVersion) >= 0) {
    return [];
  }

  return BREAKING_CHANGES.filter(record =>
    compareSemver(record.version, installedVersion) > 0
  );
}

/**
 * Simple semver comparator. Only handles major.minor.patch (no pre-release).
 * Returns negative if a < b, zero if equal, positive if a > b.
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareSemver(a, b) {
  const [aMajor, aMinor, aPatch] = a.replace(/^v/, '').split('.').map(Number);
  const [bMajor, bMinor, bPatch] = b.replace(/^v/, '').split('.').map(Number);

  if (aMajor !== bMajor) return aMajor - bMajor;
  if (aMinor !== bMinor) return aMinor - bMinor;
  return aPatch - bPatch;
}
