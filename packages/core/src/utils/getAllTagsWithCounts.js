/**
 * Get all unique tags from posts, thoughts, and codes with item counts.
 */
import { getUniqueTags, getPostsByTag } from './findPosts.js';
import { getUniqueThoughtTags, getThoughtsByTag } from './findThoughts.js';
import { findCodes } from './findCodes.js';
import { normalizeTag } from './normalizeTag.js';

/**
 * Get all unique tags with their item counts across posts, thoughts, and codes.
 * @param {string} baseDir - Base directory containing content folders (default: './content')
 * @returns {Promise<{tags: string[], counts: Record<string, number>}>}
 */
export async function getAllTagsWithCounts(baseDir = './content') {
  const postTags = await getUniqueTags(baseDir);
  const thoughtTags = await getUniqueThoughtTags(baseDir);
  const allCodes = await findCodes(baseDir);
  const codeTags = allCodes.flatMap(c =>
    Array.isArray(c.tags) ? c.tags.map(normalizeTag) : []
  );

  const allTagSet = new Set([...postTags, ...thoughtTags, ...codeTags]);
  const tags = Array.from(allTagSet).sort();

  const counts = {};
  for (const tag of tags) {
    counts[tag] =
      (await getPostsByTag(tag, baseDir)).length +
      (await getThoughtsByTag(tag, baseDir)).length +
      allCodes.filter(c =>
        Array.isArray(c.tags) && c.tags.some(t => normalizeTag(t) === tag)
      ).length;
  }

  return { tags, counts };
}
