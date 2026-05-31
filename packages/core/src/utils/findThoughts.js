/**
 * Import all thoughts from content/thoughts directory
 * Supports both .md and .mdx files
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseMarkdown } from './parseMarkdown.js';
import { generateSlug } from './generateSlug.js';
import { findCodes } from './findCodes.js';
import { parseUTC, toLocalTime } from './timezone.js';
import { normalizeTag } from './normalizeTag.js';

function isThoughtFile(filename) {
  return filename.endsWith('.md') || filename.endsWith('.mdx');
}

async function readThoughtFile(filePath, filename, codes, config) {
  const rawContent = readFileSync(filePath, 'utf8');
  const parsed = await parseMarkdown(rawContent, filename, codes, config);
  const utcTime = parsed.frontmatter.time;
  return {
    filename,
    content: parsed.content,
    contentHtml: parsed.contentHtml,
    time: utcTime,
    localTime: utcTime ? toLocalTime(utcTime) : '',
    tags: parsed.frontmatter.tags,
    color: parsed.frontmatter.color,
  };
}

export async function findThoughts(baseDir = './content') {
  const thoughtsDir = join(baseDir, 'thoughts');
  const files = readdirSync(thoughtsDir);
  const thoughts = [];

  // Load all codes for CodeContent embed resolution
  const codes = await findCodes(baseDir);

  for (const file of files) {
    if (isThoughtFile(file)) {
      const filepath = join(thoughtsDir, file);
      if (existsSync(filepath)) {
        const thought = await readThoughtFile(filepath, file, codes, { baseDir });
        thoughts.push({
          ...thought,
          slug: generateSlug(file),
        });
      }
    }
  }

  thoughts.sort((a, b) => {
    const timeA = a.time ? parseUTC(a.time).getTime() : 0;
    const timeB = b.time ? parseUTC(b.time).getTime() : 0;
    return timeB - timeA;
  });
  return thoughts;
}

export async function findThoughtBySlug(slug, baseDir = './content') {
  const thoughtsDir = join(baseDir, 'thoughts');
  const files = readdirSync(thoughtsDir);

  for (const file of files) {
    if (isThoughtFile(file)) {
      const fileSlug = generateSlug(file);
      const nameWithoutExt = file.replace(/\.(md|mdx)$/, '');
      if (fileSlug === slug || nameWithoutExt === slug) {
        const filepath = join(thoughtsDir, file);
        const codes = await findCodes(baseDir);
        const thought = await readThoughtFile(filepath, file, codes, { baseDir });
        return {
          ...thought,
          slug: fileSlug,
        };
      }
    }
  }
  return null;
}

export async function getThoughtsByTag(tag, baseDir = './content') {
  const allThoughts = await findThoughts(baseDir);
  const normalizedTag = normalizeTag(tag);

  return allThoughts.filter(thought => {
    return Array.isArray(thought.tags) && thought.tags.some(
      t => normalizeTag(t) === normalizedTag
    );
  });
}

export async function getUniqueThoughtTags(baseDir = './content') {
  const allThoughts = await findThoughts(baseDir);
  const tagSet = new Set();

  for (const thought of allThoughts) {
    if (Array.isArray(thought.tags)) {
      for (const tag of thought.tags) {
        tagSet.add(normalizeTag(tag));
      }
    }
  }

  return Array.from(tagSet).sort();
}
