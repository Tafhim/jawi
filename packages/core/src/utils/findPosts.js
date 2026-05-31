/**
 * Import all posts from content/posts directory
 * Supports both .md and .mdx files
 * @param {string} baseDir - Base directory containing content folders (default: './content')
 * @returns {Promise<{filename: string, slug: string, date: string, tags: any[], images: any[]}[]>}
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { parseMarkdown } from './parseMarkdown.js';
import { generateSlug } from './generateSlug.js';
import { parseUTC, toLocalTime } from './timezone.js';
import { normalizeTag } from './normalizeTag.js';

/**
 * Helper to check if a file is MD( or MDX)
 */
function isPostFile(filename) {
  return filename.endsWith('.md') || filename.endsWith('.mdx');
}

/**
 * Read and parse a single post file (both .md and .mdx)
 */
async function readPostFile(filePath, filename, config) {
  const content = readFileSync(filePath, 'utf8');
  const parsed = await parseMarkdown(content, filename, [], config);

  // .mdx files: parseMarkdown extracts frontmatter here;
  // actual MDX rendering is handled by Astro's MDX compiler at page render time.
  const utcTime = parsed.frontmatter.time;
  return {
    filename,
    content,
    title: parsed.frontmatter.title,
    time: utcTime,
    localTime: utcTime ? toLocalTime(utcTime) : '',
    tags: parsed.frontmatter.tags,
    images: parsed.frontmatter.images || []
  };
}

export async function findPosts(baseDir = './content') {
  const postsDir = join(baseDir, 'posts');
  const files = readdirSync(postsDir);
  const posts = [];

  for (const file of files) {
    if (isPostFile(file)) {
      const filepath = join(postsDir, file);
      if (existsSync(filepath)) {
        const post = await readPostFile(filepath, file, { baseDir });
        // Validate required fields
        if (!post.title) {
          throw new Error(`Post "${post.filename}" is missing a required "title" in frontmatter.\n   Add a title field: title: "My Post Title"`);
        }

        posts.push({
          ...post,
          slug: generateSlug(file),
        });
      }
    }
  }

  posts.sort((a, b) => {
    const timeA = a.time ? parseUTC(a.time).getTime() : 0;
    const timeB = b.time ? parseUTC(b.time).getTime() : 0;
    return timeB - timeA;
  });

  return posts;
}

/**
 * Find post by slug
 * Supports both .md and .mdx files
 */
export async function findPostBySlug(slug, baseDir = './content') {
  const postsDir = join(baseDir, 'posts');
  const files = readdirSync(postsDir);

  for (const file of files) {
    if (isPostFile(file)) {
      const filepath = join(postsDir, file);
      const content = readFileSync(filepath, 'utf8');
      const slugFromFile = generateSlug(file);

      if (slugFromFile === slug || file.replace(/\.(md|mdx)$/, '') === slug) {
        return { filename: file, content };
      }
    }
  }

  return null;
}

/**
 * Get posts that match a specific tag (case-insensitive)
 * Removes the '#' prefix from tags before comparing
 */
export async function getPostsByTag(tag, baseDir = './content') {
  const allPosts = await findPosts(baseDir);
  // Normalize: strip all leading '#' for comparison
  const normalizedTag = normalizeTag(tag);

  return allPosts.filter(post => {
    return Array.isArray(post.tags) && post.tags.some(
      t => normalizeTag(t) === normalizedTag
    );
  });
}

/**
 * Get all unique tags across all posts (sorted, no duplicates)
 */
export async function getUniqueTags(baseDir = './content') {
  const allPosts = await findPosts(baseDir);
  const tagSet = new Set();

  for (const post of allPosts) {
    if (Array.isArray(post.tags)) {
      for (const tag of post.tags) {
        // Store normalized tag (lowercase, strip all leading '#' characters)
        tagSet.add(normalizeTag(tag));
      }
    }
  }

  return Array.from(tagSet).sort();
}
