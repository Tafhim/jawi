import { getPostsByTag, getUniqueTags } from './findPosts.js';
import { getThoughtsByTag, getUniqueThoughtTags } from './findThoughts.js';
import { findCodes } from './findCodes.js';
import { parseUTC } from './timezone.js';

/**
 * Get all unique tags from posts, thoughts, and codes.
 * @param {string} baseDir - Base directory containing content folders (default: './content')
 */
export async function getAllUniqueTags(baseDir = './content') {
  const postTags = await getUniqueTags(baseDir);
  const thoughtTags = await getUniqueThoughtTags(baseDir);
  const allCodes = await findCodes(baseDir);
  const codeTags = allCodes.flatMap(c =>
    Array.isArray(c.tags) ? c.tags.map(t => t.replace(/^#+/, '').toLowerCase()) : []
  );
  return Array.from(new Set([...postTags, ...thoughtTags, ...codeTags])).sort();
}

/**
 * Get all items (posts, thoughts, codes) for a given tag, sorted by date descending.
 * @param {string} tag - The tag to search for
 * @param {string} baseDir - Base directory containing content folders (default: './content')
 */
export async function getItemsByTag(tag, baseDir = './content') {
  const posts = await getPostsByTag(tag, baseDir);
  const thoughts = await getThoughtsByTag(tag, baseDir);
  const allCodes = await findCodes(baseDir);
  const normalizedTag = tag.replace(/^#+/, '').toLowerCase();
  const codes = allCodes.filter(c =>
    Array.isArray(c.tags) && c.tags.some(t => t.replace(/^#+/, '').toLowerCase() === normalizedTag)
  );

  const items = [
    ...posts.map(p => ({ ...p, type: 'post' })),
    ...thoughts.map(t => ({ ...t, type: 'thought' })),
    ...codes.map(c => ({ ...c, type: 'code' })),
  ].sort((a, b) => {
    const timeA = a.time ? parseUTC(a.time).getTime() : 0;
    const timeB = b.time ? parseUTC(b.time).getTime() : 0;
    return timeB - timeA;
  });

  return items;
}
