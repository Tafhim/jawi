/**
 * Copy a framework file from @jawi/core into the user project.
 *
 * Usage: jawi copy <type> <name> [--force]
 *
 * Types: page, component, layout
 *
 * Examples:
 *   jawi copy page index
 *   jawi copy component PostCard
 *   jawi copy layout MainLayout
 *   jawi copy page posts/[slug] --force
 */

import { createRequire } from 'module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve, relative, posix } from 'path';
import { resolveFrameworkPath, knownTypes, typeLabel } from './resolve-path.js';

const require = createRequire(import.meta.url);

/**
 * Find the absolute path to the @jawi/core package root.
 */
function getJawiCorePath() {
  try {
    // Resolve package.json to get the package root directory
    return require.resolve('@jawi/core/package.json');
  } catch {
    // When running from within the package itself, resolve relative to this file
    return new URL('../package.json', import.meta.url).pathname;
  }
}

/**
 * Resolve the absolute path to a framework source file.
 */
function getFrameworkFilePath(relPath) {
  const corePackagePath = getJawiCorePath();
  const coreDir = dirname(corePackagePath);
  return join(coreDir, relPath);
}

/**
 * Resolve the absolute path to the user project destination file.
 */
function getUserFilePath(relPath) {
  return resolve(process.cwd(), relPath);
}

/**
 * Compute a relative import path from a source file to a target file.
 * Uses POSIX-style paths (forward slashes) for imports.
 */
function computeRelativeImport(fromFile, toFile) {
  const fromDir = dirname(fromFile);
  const rel = relative(fromDir, toFile);
  // Ensure it starts with ./ or ../
  const prefixed = rel.startsWith('.') ? rel : './' + rel;
  // Use forward slashes for imports
  return prefixed.replace(/\\/g, '/');
}

/**
 * Map file type to the @jawi/core import prefix.
 */
const TYPE_IMPORT_MAP = {
  page: null,           // Pages don't import other pages via @jawi/core
  component: '@jawi/core/components',
  layout: '@jawi/core/layouts',
};

/**
 * Recursively find all .astro files in a directory.
 */
function findAstroFiles(dir, results = []) {
  if (!existsSync(dir)) return results;
  const entries = existsSync(dir) && require('fs').readdirSync(dir, { withFileTypes: true });
  if (!entries) return results;
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findAstroFiles(fullPath, results);
    } else if (entry.name.endsWith('.astro')) {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * After copying a file, update all imports in the user's src/ directory
 * that reference the framework version to point to the local copy instead.
 * Also checks if the newly copied file imports other already-overridden files.
 */
function rewriteImports(type, name, userFilePath) {
  const importPrefix = TYPE_IMPORT_MAP[type];

  const srcDir = resolve(process.cwd(), 'src');
  if (!existsSync(srcDir)) return;

  const astroFiles = findAstroFiles(srcDir);

  // 1. If this is a component/layout, rewrite imports in ALL user files
  //    that reference the framework version of this file
  if (importPrefix) {
    const frameworkImport = `@jawi/core/${type === 'component' ? 'components' : 'layouts'}/${name}`;

    let totalChanges = 0;

    for (const file of astroFiles) {
      // Skip the file that was just copied
      if (file === userFilePath) continue;

      let content = readFileSync(file, 'utf-8');
      let newContent = content;

      // Match import statements: import X from '@jawi/core/components/Name'
      // Also handle: import X from '@jawi/core/components/Name.astro' (with or without extension)
      const pattern = new RegExp(`(['"])${frameworkImport}(\\.astro)?(['"])`, 'g');

      if (pattern.test(newContent)) {
        const relImport = computeRelativeImport(file, userFilePath);
        const replacement = `$1${relImport}$3`;
        newContent = newContent.replace(pattern, replacement);
        totalChanges++;
      }

      if (newContent !== content) {
        writeFileSync(file, newContent, 'utf-8');
        const relFile = relative(process.cwd(), file);
        console.log(`  Updated imports in ${relFile}`);
      }
    }

    if (totalChanges > 0) {
      console.log(`  Rewired ${totalChanges} import(s) to use local copy`);
    }
  }

  // 2. Check if the newly copied file imports other already-overridden components/layouts
  //    and update those imports to use the local copies
  const copiedContent = readFileSync(userFilePath, 'utf-8');
  const overriddenTypes = ['component', 'layout'];

  for (const oType of overriddenTypes) {
    const oDir = type === oType ? 'components' : 'layouts';
    // Find all overridden files of this type in src/
    const oSrcDir = resolve(srcDir, oDir === 'components' ? 'components' : oDir === 'layouts' ? 'layouts' : oDir);
    // Map type to actual directory name
    const actualDir = oType === 'component' ? 'components' : 'layouts';
    const overrideDir = resolve(srcDir, actualDir);
    if (!existsSync(overrideDir)) continue;

    const overrideFiles = findAstroFiles(overrideDir);
    for (const overrideFile of overrideFiles) {
      const oName = overrideFile.replace(/\.astro$/, '').replace(overrideDir + '/', '').replace(/\\/g, '/');
      const oFrameworkImport = `@jawi/core/${actualDir}/${oName}`;
      const pattern = new RegExp(`(['"])${oFrameworkImport}(\\.astro)?(['"])`, 'g');

      let content = readFileSync(userFilePath, 'utf-8');
      if (pattern.test(content)) {
        const relImport = computeRelativeImport(userFilePath, overrideFile);
        const replacement = `$1${relImport}$3`;
        const newContent = content.replace(pattern, replacement);
        writeFileSync(userFilePath, newContent, 'utf-8');
        const relOverride = relative(process.cwd(), overrideFile);
        console.log(`  Linked ${relOverride} in copied file`);
      }
    }
  }
}

export async function copy(args) {
  if (args.length < 2) {
    console.error('Usage: jawi copy <type> <name> [--force]');
    console.error('Types: page, component, layout');
    console.error('');
    console.error('Examples:');
    console.error('  jawi copy page index');
    console.error('  jawi copy component PostCard');
    console.error('  jawi copy layout MainLayout');
    console.error('  jawi copy page posts/[slug] --force');
    process.exit(1);
  }

  const type = args[0];
  const name = args[1];
  const force = args.includes('--force');

  // Validate type
  if (!knownTypes().includes(type)) {
    console.error(`Unknown type: ${type}`);
    console.error(`Valid types: ${knownTypes().join(', ')}`);
    process.exit(1);
  }

  // Resolve paths
  const relPath = resolveFrameworkPath(type, name);
  if (!relPath) {
    console.error(`Could not resolve path for ${type} "${name}"`);
    process.exit(1);
  }

  const frameworkPath = getFrameworkFilePath(relPath);
  const userPath = getUserFilePath(relPath);

  // Check that the framework source file exists
  if (!existsSync(frameworkPath)) {
    console.error(`Framework file not found: ${relPath}`);
    console.error(`The ${typeLabel(type)} "${name}" does not exist in @jawi/core.`);
    process.exit(1);
  }

  // Check if user file already exists
  if (existsSync(userPath)) {
    if (!force) {
      console.error(`File already exists: ${userPath}`);
      console.error(`Use --force to overwrite.`);
      process.exit(1);
    } else {
      console.warn(`Warning: overwriting existing file: ${userPath}`);
    }
  }

  // Create parent directories if needed
  const userDir = dirname(userPath);
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }

  // Copy the file
  const content = readFileSync(frameworkPath, 'utf-8');
  writeFileSync(userPath, content, 'utf-8');

  console.log(`Copied ${relPath}`);

  // Rewrite imports in user's src/ to use the local copy
  rewriteImports(type, name, userPath);
}
