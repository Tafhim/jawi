/**
 * Run content migrations
 *
 * @usage jawi migrate <migration> [flags]
 *
 * Migrations:
 *   slugs  — Migrate content slugs to 32-char compact UUIDs (idempotent)
 *   time   — Migrate `date` fields to `time` fields (UTC timestamps)
 *
 * Flags:
 *   --dry-run  Preview changes without writing (time migration only)
 */

import { readdirSync, readFileSync, writeFileSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { loadConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Slug migration (ported from scripts/migrate-slugs.mjs)
// ---------------------------------------------------------------------------

const SLUG_CONTENT_DIRS = ['posts', 'codes', 'thoughts'];

function isContentFile(filename) {
  return filename.endsWith('.md') || filename.endsWith('.mdx');
}

function updateFrontmatterSlug(content, newSlug) {
  return content.replace(/^(slug:\s*.+)$/m, `slug: ${newSlug}`);
}

/**
 * Migrate content slugs to 32-char compact UUIDs.
 * Idempotent: skips files that already have 32-char slugs.
 * @param {string} contentDir - Root content directory from config
 */
function migrateSlugs(contentDir) {
  let count = 0;

  for (const dirName of SLUG_CONTENT_DIRS) {
    const dirPath = join(contentDir, dirName);
    try {
      const files = readdirSync(dirPath);

      for (const file of files) {
        if (!isContentFile(file)) continue;

        const oldSlug = file.replace(/\.(md|mdx)$/, '');
        const ext = file.slice(file.lastIndexOf('.'));

        // Skip if already 32 chars (already migrated)
        if (oldSlug.length === 32) {
          console.log(`  Skip ${dirName}/${file} (already 32 chars)`);
          continue;
        }

        const newSlug = randomUUID().replace(/-/g, '');
        const oldPath = join(dirPath, file);
        const newPath = join(dirPath, `${newSlug}${ext}`);

        // Read, update frontmatter, write to new path
        let content = readFileSync(oldPath, 'utf8');
        content = updateFrontmatterSlug(content, newSlug);
        writeFileSync(newPath, content, 'utf8');

        // Remove old file
        unlinkSync(oldPath);

        console.log(`  ${dirName}/${file} -> ${dirName}/${newSlug}${ext}`);
        count++;
      }
    } catch (e) {
      if (e.code !== 'ENOENT') {
        console.error(`Error processing ${dirName}:`, e.message);
      }
    }
  }

  console.log(`\nMigrated ${count} files.`);
}

// ---------------------------------------------------------------------------
// Time migration (ported from scripts/migrate-time.mjs)
// ---------------------------------------------------------------------------

const TIME_CONTENT_DIRS = ['posts', 'codes', 'thoughts'];

function formatDateUTC(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

function parseDateLine(line) {
  const match = line.match(/^(\s*)date:\s*(\d{4}-\d{2}-\d{2})\s*$/);
  if (!match) return null;
  return { indent: match[1], dateStr: match[2] };
}

function parseTimeLine(line) {
  const match = line.match(/^(\s*)time:\s*(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*$/);
  if (!match) return null;
  return { indent: match[1], timeStr: match[2] };
}

/**
 * Migrate a single file from `date` to `time` field.
 * @param {string} filePath - Full path to the file
 * @param {string} content - File content
 * @param {string} dirName - Content subdirectory name (posts/codes/thoughts)
 * @param {boolean} dryRun - If true, don't write changes
 * @returns {Object} Migration result
 */
function migrateFile(filePath, content, dirName, dryRun) {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterStart = -1;
  let frontmatterEnd = -1;
  let dateFound = false;
  let timeFound = false;
  let dateLineIndex = -1;
  let dateStr = '';
  let dateIndent = '';
  let migrated = false;
  let newTimeStr = '';

  // First pass: find frontmatter boundaries and date/time fields
  let dashCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount++;
      if (dashCount === 1) {
        frontmatterStart = i;
        inFrontmatter = true;
        continue;
      }
      if (dashCount === 2) {
        frontmatterEnd = i;
        inFrontmatter = false;
        break;
      }
    }
    if (inFrontmatter) {
      const dateMatch = parseDateLine(lines[i]);
      if (dateMatch) {
        dateFound = true;
        dateLineIndex = i;
        dateStr = dateMatch.dateStr;
        dateIndent = dateMatch.indent;
      }
      const timeMatch = parseTimeLine(lines[i]);
      if (timeMatch) {
        timeFound = true;
      }
    }
  }

  // Skip if already has time field
  if (timeFound) {
    return { migrated: false, reason: 'already has time field' };
  }

  // Determine the new time value
  if (dirName === 'codes' && !dateFound) {
    // Codes have no date field - use file mtime
    const stats = statSync(filePath);
    const mtime = new Date(stats.mtimeMs);
    newTimeStr = formatDateUTC(mtime);
  } else if (dateFound) {
    // Convert date to midnight UTC
    const [year, month, day] = dateStr.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
    newTimeStr = formatDateUTC(dateObj);
  } else {
    return { migrated: false, reason: 'no date field found' };
  }

  // Second pass: apply changes
  if (dateFound) {
    // Replace date line with time line
    lines[dateLineIndex] = `${dateIndent}time: ${newTimeStr}`;
  } else {
    // Insert time line after frontmatter opening ---
    const insertIndex = frontmatterStart + 1;
    lines.splice(insertIndex, 0, `time: ${newTimeStr}`);
  }

  migrated = true;
  const newContent = lines.join('\n');

  if (!dryRun) {
    writeFileSync(filePath, newContent, 'utf-8');
  }

  return {
    migrated,
    oldDate: dateFound ? dateStr : '(none - used mtime)',
    newTime: newTimeStr,
  };
}

/**
 * Migrate content from `date` to `time` fields.
 * @param {string} contentDir - Root content directory from config
 * @param {boolean} dryRun - If true, preview changes without writing
 */
function migrateTime(contentDir, dryRun) {
  console.log(`\n${dryRun ? 'DRY RUN - ' : ''}Migrating content from date to time (UTC)...\n`);

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const dirName of TIME_CONTENT_DIRS) {
    const dirPath = join(contentDir, dirName);

    try {
      const files = readdirSync(dirPath);
      console.log(`\n[${dirName}] Processing ${files.length} files...`);

      for (const file of files) {
        if (!file.endsWith('.md') && !file.endsWith('.mdx')) {
          continue;
        }

        const filePath = join(dirPath, file);
        const content = readFileSync(filePath, 'utf-8');

        try {
          const result = migrateFile(filePath, content, dirName, dryRun);

          if (result.migrated) {
            totalMigrated++;
            console.log(`  ${file}: ${result.oldDate} -> ${result.newTime}`);
          } else {
            totalSkipped++;
            console.log(`  ${file}: skipped (${result.reason})`);
          }
        } catch (err) {
          totalErrors++;
          console.error(`  ${file}: ERROR - ${err.message}`);
        }
      }
    } catch (err) {
      if (err.code === 'ENOENT') {
        console.log(`\n[${dirName}] Directory not found, skipping.`);
      } else {
        console.error(`\n[${dirName}] ERROR - ${err.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Summary:`);
  console.log(`  Migrated: ${totalMigrated}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  Errors:   ${totalErrors}`);

  if (dryRun) {
    console.log(`\n(Dry run - no files were modified. Run without --dry-run to apply.)`);
  } else {
    console.log(`\nDone! Don't forget to rebuild: npm run build`);
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

/**
 * Run a content migration.
 * @param {string[]} args - CLI arguments: [migration, ...flags]
 */
export async function migrate(args) {
  if (args.length === 0) {
    console.error('Usage: jawi migrate <migration> [flags]');
    console.error('');
    console.error('Migrations:');
    console.error('  slugs  — Migrate content slugs to 32-char compact UUIDs');
    console.error('  time   — Migrate date fields to time fields (UTC)');
    console.error('');
    console.error('Flags:');
    console.error('  --dry-run  Preview changes without writing (time migration only)');
    process.exit(1);
  }

  const migration = args[0];
  const flags = args.slice(1);
  const dryRun = flags.includes('--dry-run');

  const config = await loadConfig(process.cwd());
  const contentDir = config.content.dir;

  switch (migration) {
    case 'slugs':
      console.log('\nMigrating slugs to 32-char compact UUIDs...\n');
      migrateSlugs(contentDir);
      break;

    case 'time':
      migrateTime(contentDir, dryRun);
      break;

    default:
      console.error(`Unknown migration: ${migration}`);
      console.error('Available migrations: slugs, time');
      process.exit(1);
  }
}
