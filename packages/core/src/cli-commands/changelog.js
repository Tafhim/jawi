/**
 * Display the @jawi/core changelog
 *
 * @usage jawi changelog [--json] [--unreleased]
 *
 * Flags:
 *   --json       Output as machine-readable JSON
 *   --unreleased Show only unreleased changes
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHANGELOG_PATH = join(__dirname, '..', '..', 'CHANGELOG.md');

/**
 * Parse a changelog line for version header: ## [1.0.0] - 2026-05-30
 */
function parseVersionHeader(line) {
  const match = line.match(/^##\s*\[(.+?)\]\s*-\s*(.+?)\s*$/);
  if (!match) return null;
  return { version: match[1], date: match[2].trim() };
}

/**
 * Parse a section header: ### Added, ### Changed, ### Fixed, etc.
 */
function parseSectionHeader(line) {
  const match = line.match(/^###\s+(.+?)\s*$/);
  if (!match) return null;
  return match[1].trim();
}

/**
 * Parse changelog markdown into a structured JSON object.
 * @param {string} markdown - Raw changelog content
 * @returns {Object} Parsed changelog
 */
function parseChangelog(markdown) {
  const lines = markdown.split('\n');
  const versions = [];
  let currentVersion = null;
  let currentSection = null;
  let currentItems = [];

  function flushSection() {
    if (currentVersion && currentSection && currentItems.length > 0) {
      currentVersion.sections[currentSection] = currentItems;
    }
    currentSection = null;
    currentItems = [];
  }

  function flushVersion() {
    flushSection();
    if (currentVersion) {
      versions.push(currentVersion);
    }
    currentVersion = null;
  }

  for (const line of lines) {
    const versionHeader = parseVersionHeader(line);
    if (versionHeader) {
      flushVersion();
      currentVersion = {
        version: versionHeader.version,
        date: versionHeader.date,
        sections: {},
      };
      continue;
    }

    const sectionHeader = parseSectionHeader(line);
    if (sectionHeader && currentVersion) {
      flushSection();
      currentSection = sectionHeader;
      continue;
    }

    // Collect list items under current section
    if (currentVersion && currentSection) {
      const itemMatch = line.match(/^-\s+(.+)$/);
      if (itemMatch) {
        currentItems.push(itemMatch[1]);
      } else if (line.trim() === '') {
        // Empty line might end a section
        if (currentItems.length > 0) {
          flushSection();
        }
      }
    }
  }

  flushVersion();
  return { versions };
}

/**
 * Extract only the unreleased section from changelog markdown.
 * @param {string} markdown - Raw changelog content
 * @returns {string} Unreleased section text, or empty string
 */
function extractUnreleased(markdown) {
  const lines = markdown.split('\n');
  const result = [];
  let inUnreleased = false;

  for (const line of lines) {
    if (line.match(/^##\s*\[Unreleased\]/)) {
      inUnreleased = true;
      result.push(line);
      continue;
    }
    if (inUnreleased) {
      if (line.match(/^##\s*\[/)) {
        break;
      }
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Display the changelog.
 * @param {string[]} args - CLI arguments
 */
export async function changelog(args) {
  const jsonFlag = args.includes('--json');
  const unreleasedFlag = args.includes('--unreleased');

  let content;
  try {
    content = readFileSync(CHANGELOG_PATH, 'utf-8');
  } catch (err) {
    console.error('Error: Could not read CHANGELOG.md');
    console.error(err.message);
    process.exit(1);
  }

  if (unreleasedFlag) {
    const unreleased = extractUnreleased(content);
    if (jsonFlag) {
      const parsed = parseChangelog(unreleased);
      console.log(JSON.stringify(parsed, null, 2));
    } else {
      if (unreleased.trim()) {
        console.log(unreleased);
      } else {
        console.log('No unreleased changes.');
      }
    }
    return;
  }

  if (jsonFlag) {
    const parsed = parseChangelog(content);
    console.log(JSON.stringify(parsed, null, 2));
  } else {
    console.log(content);
  }
}
