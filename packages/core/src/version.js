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
