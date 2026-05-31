/**
 * Override manifest utilities for tracking user customizations.
 *
 * The manifest stores hashes of user override files and framework default files.
 * On upgrade, it compares framework file hashes to detect which overrides may
 * need attention because the framework file changed.
 *
 * Manifest location: .jawi/overrides.json (in user project root)
 *
 * Manifest shape:
 *   {
 *     version: "1.0.0",          // @jawi/core version when manifest was created
 *     frameworkHashes: {         // hashes of framework files at time of creation
 *       "pages/index.astro": "abc123...",
 *       "layouts/MainLayout.astro": "def456...",
 *     },
 *     userHashes: {              // hashes of user override files
 *       "src/pages/index.astro": "789xyz...",
 *     }
 *   }
 */

import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Directory within the framework package containing default files
const FRAMEWORK_SRC = resolve(__dirname);

// User project directories that can contain overrides
const OVERRIDE_DIRS = ['pages', 'components', 'layouts'];

/**
 * Compute a SHA-256 hash of a file's contents.
 * @param {string} filePath
 * @returns {string} Hex hash string
 */
export function hashFile(filePath) {
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Get the path to the manifest file in the user project.
 * @param {string} projectRoot
 * @returns {string}
 */
export function getManifestPath(projectRoot) {
  return join(projectRoot, '.jawi', 'overrides.json');
}

/**
 * Load the override manifest from disk.
 * @param {string} projectRoot
 * @returns {object|null} Manifest object or null if not found
 */
export function loadManifest(projectRoot) {
  const manifestPath = getManifestPath(projectRoot);
  if (!existsSync(manifestPath)) {
    return null;
  }
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Create or update the override manifest.
 * Scans user project for override files and framework default files,
 * then stores their hashes.
 *
 * @param {string} projectRoot - User project root directory
 * @param {string} frameworkVersion - Current @jawi/core version
 * @returns {object} The created/updated manifest
 */
export function createOverrideManifest(projectRoot, frameworkVersion) {
  const manifest = {
    version: frameworkVersion,
    frameworkHashes: {},
    userHashes: {},
  };

  // Hash framework default files
  for (const subdir of OVERRIDE_DIRS) {
    const frameworkDir = join(FRAMEWORK_SRC, subdir);
    const files = findAstroFiles(frameworkDir);
    for (const file of files) {
      const key = `${subdir}/${file}`;
      const filePath = join(frameworkDir, file);
      if (existsSync(filePath)) {
        manifest.frameworkHashes[key] = hashFile(filePath);
      }
    }
  }

  // Hash user override files
  const userSrcDir = join(projectRoot, 'src');
  if (existsSync(userSrcDir)) {
    for (const subdir of OVERRIDE_DIRS) {
      const userDir = join(userSrcDir, subdir);
      const files = findAstroFiles(userDir);
      for (const file of files) {
        const key = `src/${subdir}/${file}`;
        const filePath = join(userDir, file);
        if (existsSync(filePath)) {
          manifest.userHashes[key] = hashFile(filePath);
        }
      }
    }
  }

  // Write manifest
  const manifestPath = getManifestPath(projectRoot);
  const manifestDir = join(projectRoot, '.jawi');
  mkdirSync(manifestDir, { recursive: true });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  return manifest;
}

/**
 * Compare current framework files against stored hashes to find
 * which framework files have changed since the manifest was created.
 *
 * @param {string} projectRoot - User project root directory
 * @returns {Array<{frameworkKey: string, userName: string, userType: string}>}
 *   List of overrides where the framework file has changed
 */
export function findChangedOverrides(projectRoot) {
  const manifest = loadManifest(projectRoot);
  if (!manifest) {
    return [];
  }

  const changed = [];

  for (const [frameworkKey, oldHash] of Object.entries(manifest.frameworkHashes)) {
    const frameworkPath = join(FRAMEWORK_SRC, frameworkKey);
    if (!existsSync(frameworkPath)) {
      continue;
    }

    const newHash = hashFile(frameworkPath);
    if (newHash !== oldHash) {
      // Framework file changed - check if user has an override
      const [subdir, fileName] = frameworkKey.split('/');
      const userFileName = fileName.replace(/\.astro$/, '');

      changed.push({
        frameworkKey,
        userName: userFileName,
        userType: subdir === 'pages' ? 'page' : subdir === 'components' ? 'component' : 'layout',
      });
    }
  }

  return changed;
}

/**
 * Check if a specific user override exists for a given framework file.
 * @param {string} projectRoot
 * @param {string} type - 'page', 'component', or 'layout'
 * @param {string} name - e.g. 'index', 'MainLayout', 'PostCard'
 * @returns {boolean}
 */
export function hasOverride(projectRoot, type, name) {
  const subdirMap = { page: 'pages', component: 'components', layout: 'layouts' };
  const subdir = subdirMap[type];
  if (!subdir) return false;

  const overridePath = join(projectRoot, 'src', subdir, `${name}.astro`);
  return existsSync(overridePath);
}

/**
 * Recursively find .astro files in a directory.
 * @param {string} dir
 * @returns {string[]}
 */
function findAstroFiles(dir) {
  const results = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        results.push(...findAstroFiles(join(dir, entry.name)));
      } else if (entry.name.endsWith('.astro')) {
        results.push(entry.name);
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return results;
}
