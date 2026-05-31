/**
 * jawi upgrade -- Check for framework upgrades.
 *
 * Usage:
 *   jawi upgrade --check          Check for available upgrades
 *   jawi upgrade --check --json   Machine-readable output
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { getVersion, getBreakingChangesBetween, compareSemver } from '../version.js';
import {
  findChangedOverrides,
  createOverrideManifest,
  loadManifest,
  hasOverride,
} from '../override-manifest.js';

/**
 * Run the upgrade check command.
 * @param {string[]} args - CLI arguments (e.g. ['--check', '--json'])
 */
export async function upgrade(args) {
  const flags = parseFlags(args);

  if (args.length === 0 || (!flags.check && !flags.json && !flags.refreshManifest)) {
    showUpgradeHelp();
    return;
  }

  if (flags.refreshManifest) {
    const currentVersion = getCurrentVersion() || 'unknown';
    const manifest = createOverrideManifest(process.cwd(), currentVersion);
    if (flags.json) {
      console.log(JSON.stringify({
        version: manifest.version,
        frameworkFiles: Object.keys(manifest.frameworkHashes).length,
        userOverrides: Object.keys(manifest.userHashes).length,
      }));
    } else {
      console.log(`Override manifest refreshed.`);
      console.log(`  Framework version: v${manifest.version}`);
      console.log(`  Tracked framework files: ${Object.keys(manifest.frameworkHashes).length}`);
      console.log(`  Tracked user overrides: ${Object.keys(manifest.userHashes).length}`);
    }
    return;
  }

  if (flags.check) {
    await checkForUpgrades(flags.json);
  }
}

/**
 * Check for available upgrades and report status.
 * @param {boolean} jsonOutput - If true, output JSON instead of human-readable text
 */
async function checkForUpgrades(jsonOutput = false) {
  const currentVersion = getCurrentVersion();
  if (!currentVersion) {
    const msg = 'Could not determine installed @jawi/core version.';
    if (jsonOutput) {
      console.log(JSON.stringify({ error: msg }));
    } else {
      console.error('Error:', msg);
    }
    process.exit(1);
    return;
  }

  let latestVersion = null;
  let npmError = null;

  try {
    latestVersion = getLatestVersionFromNpm();
  } catch (err) {
    npmError = err.message;
  }

  if (latestVersion === null) {
    if (jsonOutput) {
      console.log(JSON.stringify({
        current: currentVersion,
        latest: null,
        upToDate: null,
        error: npmError || 'Failed to check npm registry',
      }));
    } else {
      console.log(`Current version: v${currentVersion}`);
      console.error('Warning: Could not check npm registry.');
      if (npmError) {
        console.error(`  ${npmError}`);
      }
      console.error('Ensure you have internet access and npm is configured.');
    }
    return;
  }

  const upToDate = isUpToDate(currentVersion, latestVersion);
  const breakingChanges = getBreakingChangesBetween(currentVersion, latestVersion);

  if (jsonOutput) {
    const result = {
      current: currentVersion,
      latest: latestVersion,
      upToDate,
    };
    if (!upToDate) {
      result.breakingChanges = breakingChanges;
      result.upgradeCommand = 'npm update @jawi/core';
    }
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // Human-readable output
  if (upToDate) {
    console.log(`You are up to date. (@jawi/core v${currentVersion})`);
  } else {
    console.log(`A new version is available!`);
    console.log(`  Current: v${currentVersion}`);
    console.log(`  Latest:  v${latestVersion}`);
    console.log('');
    console.log(`To upgrade:`);
    console.log(`  npm update @jawi/core`);

    if (breakingChanges.length > 0) {
      console.log('');
      console.log('Breaking changes:');
      for (const record of breakingChanges) {
        console.log(`  v${record.version}:`);
        for (const change of record.changes) {
          const direction = change.from && change.to
            ? ` (${change.from} -> ${change.to})`
            : '';
          console.log(`    - [${change.type}]${direction} ${change.description}`);
        }
      }
    }

    // Check for user overrides that may be affected
    const affectedOverrides = detectAffectedOverrides();
    if (affectedOverrides.length > 0) {
      console.log('');
      console.log('Overrides that may need attention:');
      for (const override of affectedOverrides) {
        console.log(`  ${override.path}`);
      }
      console.log('');
      console.log('To review changes:');
      for (const override of affectedOverrides) {
        console.log(`  jawi diff ${override.type} ${override.name}`);
      }
      console.log('');
      console.log('To reset to framework default:');
      for (const override of affectedOverrides) {
        console.log(`  jawi copy ${override.type} ${override.name} --force`);
      }
    }
  }
}

/**
 * Get the currently installed version of @jawi/core.
 * Tries node_modules first, then falls back to the package itself.
 * @returns {string|null} Version string or null if not found
 */
function getCurrentVersion() {
  // Try to read from node_modules (user project context)
  const nodeModulesPath = resolve(process.cwd(), 'node_modules/@jawi/core/package.json');
  if (existsSync(nodeModulesPath)) {
    try {
      const pkg = JSON.parse(readFileSync(nodeModulesPath, 'utf-8'));
      return pkg.version || null;
    } catch {
      // Fall through
    }
  }

  // Fall back to the package itself (when running from the monorepo)
  try {
    return getVersion();
  } catch {
    return null;
  }
}

/**
 * Query npm registry for the latest published version of @jawi/core.
 * @returns {string|null} Latest version string or null on failure
 */
function getLatestVersionFromNpm() {
  try {
    const output = execSync('npm view @jawi/core version --json 2>/dev/null', {
      encoding: 'utf-8',
      timeout: 15000,
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

/**
 * Compare two semver strings. Returns true if a >= b.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function isUpToDate(a, b) {
  return compareSemver(a, b) >= 0;
}

/**
 * Scan user project for override files that may need attention.
 * Uses the override manifest to detect which framework files have changed
 * since the manifest was last created/updated.
 * @returns {Array<{path: string, type: string, name: string}>}
 */
function detectAffectedOverrides() {
  const projectRoot = process.cwd();
  const currentVersion = getCurrentVersion() || 'unknown';

  // Create manifest if it doesn't exist
  const manifest = loadManifest(projectRoot);
  if (!manifest) {
    createOverrideManifest(projectRoot, currentVersion);
    // First run - no changes to report yet
    return [];
  }

  // Find framework files that have changed since manifest was created
  const changed = findChangedOverrides(projectRoot);

  // Filter to only include overrides where the user actually has a file
  const affected = [];
  for (const item of changed) {
    if (hasOverride(projectRoot, item.userType, item.userName)) {
      const subdirMap = { page: 'pages', component: 'components', layout: 'layouts' };
      const subdir = subdirMap[item.userType];
      affected.push({
        path: `src/${subdir}/${item.userName}.astro`,
        type: item.userType,
        name: item.userName,
      });
    }
  }

  return affected;
}

function parseFlags(args) {
  return {
    check: args.includes('--check'),
    json: args.includes('--json'),
    refreshManifest: args.includes('--refresh-manifest'),
  };
}

function showUpgradeHelp() {
  console.log(`Usage: jawi upgrade [options]

Options:
  --check                Check for available upgrades
  --json                 Output in JSON format
  --refresh-manifest     Refresh the override manifest

Examples:
  jawi upgrade --check
  jawi upgrade --check --json
  jawi upgrade --refresh-manifest`);
}
