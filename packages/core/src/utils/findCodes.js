/**
 * Import all code content from content/codes directory
 * @param {string} baseDir - Base directory containing content folders (default: './content')
 * @returns {Promise<{filename: string, slug: string, title: string, language: string, tags: string[], content: string}[]>}
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { generateSlug } from './generateSlug.js';
import { parseUTC, toLocalTime } from './timezone.js';
import { parseFrontmatter } from './parseFrontmatter.js';

export async function findCodes(baseDir = './content') {
  const codesDir = join(baseDir, 'codes');
  const files = readdirSync(codesDir);
  const codes = [];

  for (const file of files) {
    const filepath = join(codesDir, file);
    const content = readFileSync(filepath, 'utf8');

    let parsed;
    let codeBody, language, title, tags, utcTime;

    if (file.endsWith('.mdx')) {
      const { frontmatter } = parseFrontmatter(content);

      codeBody = extractMdxCode(content);
      language = frontmatter.language || 'astro';
      title = frontmatter.title || generateSlug(file);
      tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
      utcTime = frontmatter.time || null;
    } else if (file.endsWith('.md')) {
      const { frontmatter, body } = parseFrontmatter(content);
      codeBody = body || '';
      language = frontmatter.language || 'text';
      title = frontmatter.title;
      tags = frontmatter.tags || [];
      utcTime = frontmatter.time || null;
    } else {
      continue;
    }

    codes.push({
      filename: file,
      slug: generateSlug(file),
      content: codeBody,
      title,
      language,
      tags,
      time: utcTime,
      localTime: utcTime ? toLocalTime(utcTime) : ''
    });
  }

  codes.sort((a, b) => {
    const timeA = a.time ? parseUTC(a.time).getTime() : 0;
    const timeB = b.time ? parseUTC(b.time).getTime() : 0;
    return timeB - timeA;
  });

  return codes;
}

/**
 * Extract code content from MDX files (after frontmatter + Astro import blocks)
 * Handles both:
 *   - MDX with Astro imports: --- frontmatter --- --- imports --- code
 *   - Simple MDX: --- frontmatter --- code
 * @param {string[]} lines - Content lines
 * @returns {string} Extracted code body
 */
function extractMdxCode(content) {
  const lines = content.split('\n');
  let dashCount = 0;
  let contentStart = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount++;
      if (dashCount === 2) {
        // Found 2nd --- (end of frontmatter)
        // Find the first non-empty, non-dash line after it
        // (handles MDX with multiple --- blocks for Astro components)
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() && lines[j].trim() !== '---') {
            contentStart = j;
            break;
          }
        }
        break;
      }
    }
  }

  if (contentStart !== -1) {
    return lines.slice(contentStart).join('\n').trim();
  }

  // Fallback: no 2nd --- found (no frontmatter)
  return content;
}

/**
 * Find code by slug
 */
export async function findCodeBySlug(slug, baseDir = './content') {
  const codesDir = join(baseDir, 'codes');
  const files = readdirSync(codesDir);

  for (const file of files) {
    const filepath = join(codesDir, file);
    const content = readFileSync(filepath, 'utf8');

    const fileSlug = generateSlug(file);

    if (fileSlug === slug || file.replace(/\.(md|mdx)$/, '') === slug) {
      const { frontmatter, body } = parseFrontmatter(content);

      let codeBody, language;
      if (file.endsWith('.mdx')) {
        codeBody = extractMdxCode(content);
        language = frontmatter.language || 'astro';
      } else {
        codeBody = body || '';
        language = frontmatter.language || 'text';
      }

      return {
        filename: file,
        slug: fileSlug,
        content: codeBody,
        title: frontmatter.title || fileSlug,
        language,
        tags: frontmatter.tags || [],
        time: frontmatter.time || null,
        localTime: frontmatter.time ? toLocalTime(frontmatter.time) : ''
      };
    }
  }

  return null;
}
