/**
 * Show a diff between a user override and the framework default.
 *
 * Usage: jawi diff <type> <name>
 *
 * Types: page, component, layout
 *
 * Examples:
 *   jawi diff page index
 *   jawi diff component PostCard
 *   jawi diff layout MainLayout
 */

import { createRequire } from 'module';
import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
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
 * Resolve the absolute path to the user project file.
 */
function getUserFilePath(relPath) {
  return resolve(process.cwd(), relPath);
}

/**
 * Compute a simple line-by-line diff using LCS (longest common subsequence).
 * Returns an array of { type: ' ' | '+' | '-', line: string }.
 */
function computeDiff(oldLines, newLines) {
  const m = oldLines.length;
  const n = newLines.length;

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build the diff
  const result = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      result.push({ type: ' ', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: '+', line: newLines[j - 1] });
      j--;
    } else {
      result.push({ type: '-', line: oldLines[i - 1] });
      i--;
    }
  }

  result.reverse();
  return result;
}

/**
 * Apply context windowing to a raw diff.
 * Only shows changes and `context` lines around them.
 * Groups are separated by "..." when lines are elided.
 */
function applyContext(rawDiff, context = 3) {
  // Find indices of changed lines
  const changeIndices = [];
  rawDiff.forEach((entry, idx) => {
    if (entry.type !== ' ') changeIndices.push(idx);
  });

  if (changeIndices.length === 0) return [];

  // Build ranges: [start, end] for each change group
  const ranges = [];
  let groupStart = Math.max(0, changeIndices[0] - context);
  let groupEnd = changeIndices[0] + context;

  for (let k = 1; k < changeIndices.length; k++) {
    const nextStart = Math.max(0, changeIndices[k] - context);
    if (nextStart <= groupEnd + 1) {
      // Merge with current group
      groupEnd = Math.min(rawDiff.length - 1, changeIndices[k] + context);
    } else {
      ranges.push([groupStart, groupEnd]);
      groupStart = nextStart;
      groupEnd = Math.min(rawDiff.length - 1, changeIndices[k] + context);
    }
  }
  ranges.push([groupStart, groupEnd]);

  // Build output with "..." separators
  const output = [];
  let lastEnd = -1;
  for (const [start, end] of ranges) {
    if (start > lastEnd + 1) {
      output.push({ type: '...', line: '...' });
    }
    for (let idx = start; idx <= end; idx++) {
      output.push(rawDiff[idx]);
    }
    lastEnd = end;
  }

  return output;
}

export async function diff(args) {
  if (args.length < 2) {
    console.error('Usage: jawi diff <type> <name>');
    console.error('Types: page, component, layout');
    console.error('');
    console.error('Examples:');
    console.error('  jawi diff page index');
    console.error('  jawi diff component PostCard');
    console.error('  jawi diff layout MainLayout');
    process.exit(1);
  }

  const type = args[0];
  const name = args[1];

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
  const userPath = resolve(process.cwd(), relPath);

  // Check that the framework source file exists
  if (!existsSync(frameworkPath)) {
    console.error(`Framework file not found: ${relPath}`);
    process.exit(1);
  }

  // Check if user override exists
  if (!existsSync(userPath)) {
    console.log(`No override found. Using framework default.`);
    return;
  }

  // Read both files
  const frameworkContent = readFileSync(frameworkPath, 'utf-8');
  const userContent = readFileSync(userPath, 'utf-8');

  // Check for identical files
  if (frameworkContent === userContent) {
    console.log('No differences.');
    return;
  }

  // Compute diff
  const frameworkLines = frameworkContent.split('\n');
  const userLines = userContent.split('\n');
  const rawDiff = computeDiff(frameworkLines, userLines);
  const diffWithContext = applyContext(rawDiff, 3);

  // Print header
  console.log(`--- ${relPath} (framework)`);
  console.log(`+++ ${relPath} (your override)`);
  console.log('');

  // Print diff lines
  for (const entry of diffWithContext) {
    if (entry.type === '...') {
      console.log('...');
    } else {
      console.log(`${entry.type} ${entry.line}`);
    }
  }
}
