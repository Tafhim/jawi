/**
 * Parse markdown file to extract frontmatter and content
 *
 * For .md files: returns HTML from marked parse.
 * For .mdx files: additionally resolves <Link url="" text="" /> components
 *   by fetching Open Graph metadata and rendering preview cards.
 *
 * @param {string} content - Full markdown file content as string
 * @param {string} filename - The markdown file name (for slug generation)
 * @param {Array} codes - Array of code snippets for CodeContent resolution
 * @param {Object} [config] - Optional configuration object
 * @param {string} [config.cacheDir] - Custom cache directory (default: process.cwd()/.cache)
 * @param {string} [config.baseDir] - Base content directory for resolving CodeContent slugs
 * @returns {Promise<Object>} Parsed object with frontmatter metadata and HTML content body
 */

import { generateSlug } from './generateSlug.js';
import { marked } from 'marked';
import Prism from 'prismjs';
import './loadPrismLanguages.js';
import { parse } from 'parse5';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { parseFrontmatter } from './parseFrontmatter.js';
import { findCodeBySlug } from './findCodes.js';
import { convertEmojis } from './emoji.js';

/**
 * Get the build-time cache directory path.
 */
function getCacheDir(config) {
  if (config && config.cacheDir) {
    return config.cacheDir;
  }
  return join(process.cwd(), '.cache');
}

/**
 * Read cached OG data for a URL, or null if not cached / expired.
 */
async function readCachedOG(url, config) {
  try {
    const cacheDir = getCacheDir(config);
    if (!existsSync(cacheDir)) return null;

    const filename = Buffer.from(url).toString('base64url');
    const cacheFile = join(cacheDir, `${filename}.json`);

    if (!existsSync(cacheFile)) return null;

    const cached = JSON.parse(await readFile(cacheFile, 'utf8'));
    // Cache for 7 days
    if (Date.now() - cached.ts > 7 * 24 * 60 * 60 * 1000) {
      // Stale — remove it so it gets refreshed on next build
      try { await writeFile(cacheFile, JSON.stringify({ ts: 0, meta: null })); } catch { /* ignore */ }
      return null;
    }
    return cached.meta;
  } catch {
    return null;
  }
}

/**
 * Save OG metadata to the build-time cache.
 */
async function writeCachedOG(url, meta, config) {
  try {
    const cacheDir = getCacheDir(config);
    await mkdir(cacheDir, { recursive: true });

    const filename = Buffer.from(url).toString('base64url');
    const cacheFile = join(cacheDir, `${filename}.json`);
    await writeFile(cacheFile, JSON.stringify({ ts: Date.now(), meta }));
  } catch (e) {
    // Disk cache failures should not break the build
    console.warn(`Failed to cache OG data for ${url}:`, e.message);
  }
}

/**
 * Resolve a potentially relative URL to an absolute URL based on the page URL.
 */
function resolveImageUrl(imageUrl, pageUrl) {
  try {
    return new URL(imageUrl, pageUrl).href;
  } catch {
    return imageUrl;
  }
}

/**
 * Check if a URL is accessible (HEAD request with short timeout).
 */
async function checkUrlAccessible(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow'
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch Open Graph metadata from a URL by parsing the page's meta tags.
 * Mirrors the logic from @astro-community/astro-embed-link-preview/lib.ts
 */
async function fetchOpenGraph(url, config) {
  // Check cache first
  const cached = await readCachedOG(url, config);
  if (cached) return cached;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'JawiMicroblog/1.0' }
    });
    const html = await response.text();
    const doc = parse(html);

    let title, description, image, imageAlt, video, videoType;

    // Walk the DOM tree and collect meta tags
    const walk = (node) => {
      if (typeof node === 'object' && node !== null && node.tagName === 'meta' && node.attrs) {
        const attrs = Object.fromEntries(node.attrs.map(a => [a.name.toLowerCase(), (a.value || '').toLowerCase()]));
        const contentAttr = node.attrs.find(a => (a.name || '').toLowerCase() === 'content');
        const contentValue = contentAttr ? contentAttr.value : '';
        const propValue = (attrs.property || attrs.name || '').toLowerCase();

        if (propValue === 'og:title') title = contentValue;
        if (propValue === 'og:description') description = contentValue;
        if (propValue === 'og:image') image = contentValue;
        if (propValue === 'og:image:alt') imageAlt = contentValue;
        if (propValue === 'og:video') video = contentValue;
        if (propValue === 'og:video:type') videoType = contentValue;
      }

      const childNodes = node.children || node.childNodes || (node.content && node.content.childNodes);
      if (childNodes) {
        for (const child of childNodes) walk(child);
      }
    };

    walk(doc);

    // Resolve relative image URLs to absolute
    if (image) {
      image = resolveImageUrl(image, url);
    }

    // Validate that the OG image is actually accessible
    if (image && !(await checkUrlAccessible(image))) {
      console.warn(`OG image not accessible for ${url}: ${image} — will use favicon fallback`);
      image = null;
      imageAlt = null;
    }

    const meta = { title, description, image, imageAlt, video, videoType };
    // Cache the result for future builds
    writeCachedOG(url, meta, config);
    return meta;
  } catch (e) {
    console.warn(`Failed to fetch OpenGraph for ${url}:`, e.message);
    return null;
  }
}

/**
 * Render a link card HTML using the structure from @astro-community/astro-embed-link-preview.
 * @param {string} url - The URL of the link
 * @param {object|null} meta - Open Graph metadata object, or null
 * @param {string=} text - Optional custom link text (used as fallback content)
 */
function renderLinkCardHtml(url, meta, text) {
  let domain = '';
  try {
    domain = new URL(url).hostname.replace('www.', '');
  } catch { /* ignore */ }

  const hasMedia = meta && ((meta.video && meta.videoType) || meta.image);
  const hasMetadata = meta && meta.title;
  const hasVideo = !!(meta && meta.video && meta.videoType);

  const classes = ['link-preview']
    .concat(hasVideo ? ['link-preview--has-video'] : [])
    .concat(!hasMedia && hasMetadata ? ['link-preview--no-media'] : [])
    .join(' ');

  if (!hasMetadata) {
    const fallbackText = text ? esc(text) : esc(url);
    return `<div class="link-preview link-preview--no-metadata"><a href="${esc(url)}" class="link-preview__label">${fallbackText}</a></div>`;
  }

  const titlePart = hasMetadata
    ? `<header><a class="link-preview__title" href="${esc(url)}">${esc(meta.title)}</a></header>`
    : '';
  const domainPart = domain
    ? `<span class="link-preview__domain">${esc(domain)}</span>`
    : '';
  const descPart = '';

  let media = '';
  let hasFaviconFallback = false;

  if (hasVideo && meta.video && meta.videoType) {
    media = `<video controls preload="metadata" width="1200" height="630"><source src="${esc(meta.video)}" type="${esc(meta.videoType)}"></video>`;
  } else if (meta && meta.image) {
    media = `<img src="${esc(meta.image)}" alt="${esc(meta.imageAlt || '')}" width="1200" height="630">`;
  } else if (hasMetadata && domain) {
    // Fallback: use site favicon when no OG image is available
    const faviconUrl = `https://${domain}/favicon.ico`;
    media = `<img src="${esc(faviconUrl)}" alt="" class="link-preview__favicon">`;
    hasFaviconFallback = true;
  }

  // Remove no-media class when we have a favicon fallback
  const finalClasses = hasFaviconFallback
    ? classes.replace('link-preview--no-media', '').trim()
    : classes;

  const innerContent = `<article class="${finalClasses}"><div class="link-preview__content">${titlePart}${domainPart}${descPart}</div>${media}</article>`;

  // Wrap in collapsible details element with URL header bar + Copy button
  return `<details class="link-embed" open>
<summary class="link-embed-summary"><span class="link-embed-url">${esc(url)}</span><button type="button" class="link-embed-copy" data-copy-url="${esc(url)}">Copy</button></summary>
${innerContent}
</details>`;
}

/**
 * Process <Link url="" text="" /> components in parsed content HTML.
 * Replaces each <Link> with a link preview card using OG metadata.
 */
async function processLinkComponents(html, filename, config) {
  const linkRegex = /<Link\s+url="([^"]+)"(?:\s+text="([^"]*)")?\s*\/>/gi;
  const matches = [...html.matchAll(linkRegex)];

  if (matches.length === 0) return html;

  // Collect unique URLs and fetch OG metadata in parallel
  const urlSet = new Set(matches.map(m => m[1]));

  // Build a lookup: url -> first captured text value
  const urlText = {};
  for (const m of matches) {
    if (!(m[1] in urlText)) urlText[m[1]] = m[2] || '';
  }

  // Fetch OG data for all unique URLs
  const results = await Promise.all([...urlSet].map(async url => {
    const meta = await fetchOpenGraph(url, config);
    return { url, meta };
  }));

  const ogCache = Object.fromEntries(results.map(({ url, meta }) => [url, meta]));

  // Replace each <Link> with its rendered card HTML, passing text for fallback
  return html.replace(linkRegex, (match, url, text) => {
    return renderLinkCardHtml(url, ogCache[url], text || urlText[url] || undefined);
  });
}

/**
 * Escape HTML entities
 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Resolve a CodeContent block to its HTML representation.
 * If codes array is provided, uses it directly. Otherwise, looks up via findCodeBySlug.
 */
function resolveCode(slug, codes, config) {
  let codeObj;

  if (codes && codes.length > 0) {
    codeObj = codes.find(c => c.slug === slug);
  } else if (config && config.baseDir) {
    // Fallback: try to find via findCodeBySlug (sync lookup won't work here,
    // so this path is for when codes are pre-loaded)
    codeObj = null;
  }

  if (!codeObj) {
    return `<p><em>Code snippet "${slug}" not found.</em></p>`;
  }

  const rawCode = codeObj.content || '';
  const language = codeObj.language || 'javascript';
  let highlighted;

  try {
    // Map language → registered Prism grammar for syntax highlighting.
    // Keeps the original language string for CSS class display.
    const languageMap = { astro: 'markup' };
    const grammarKey = languageMap[language] || language;
    const grammar = Prism.languages[grammarKey] || Prism.languages.javascript;
    highlighted = Prism.highlight(rawCode || '', grammar, grammarKey);
  } catch (e) {
    highlighted = Prism.Utils.encodeHTML(rawCode || '');
  }

  const codeTitle = codeObj.title || 'Code';

  return `<details class="code-embed" open>
<summary class="code-embed-summary">${esc(codeTitle)}</summary>
<div class="code-embed-body"><pre><code class="language-${esc(language)}">${highlighted}</code></pre></div>
</details>`;
}

/**
 * Parse markdown file to extract frontmatter and convert content to HTML.
 * For .mdx files, asynchronously resolves <Link> and <CodeContent> components.
 */
async function parseMarkdown(content, filename, codes = [], config = null) {
  const { frontmatter, body: contentBody } = parseFrontmatter(content);

  // Default values
  frontmatter.tags = Array.isArray(frontmatter.tags) ? frontmatter.tags : [];
  frontmatter.images = Array.isArray(frontmatter.images) ? frontmatter.images : [];

  // Replace {<CodeContent slug="..." />} placeholders with HTML
  const embeds = [];
  let placeholderCounter = 0;

  let contentNoEmbeds = contentBody.replace(/\{<CodeContent\s+slug="([^"]+)"\s*\/>\}/g, (match, slug) => {
    const placeholder = `%%CODEEMBED_${placeholderCounter++}%%`;
    embeds.push({ placeholder, codeHtml: resolveCode(slug, codes, config) });
    return placeholder;
  });

  // Convert emoji shortcodes to Unicode before markdown parsing
  contentNoEmbeds = convertEmojis(contentNoEmbeds);

  // Convert markdown to HTML
  let html = marked.parse(contentNoEmbeds);

  // Restore code embeds
  for (const { placeholder, codeHtml } of embeds) {
    html = html.replace(
      new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      codeHtml
    );
  }

  // Unwrap <p> tags around standalone <details> (code embeds)
  // Case 1: <p> containing only a <details> element
  html = html.replace(/<p>\s*(<details class="code-emb[^>]*>[\s\S]*?<\/details>)\s*<\/p>/gi, '$1');
  // Case 2: <p> with text followed by <details> — split into <p>text</p><details>
  html = html.replace(/<p>([\s\S]*?)\s*(<details class="code-emb[^>]*>[\s\S]*?<\/details>)\s*<\/p>/gi, function(match, text, details) {
    // Only split if there's actual text (not just whitespace)
    if (text.trim().length > 0) {
      return `<p>${text}</p>${details}`;
    }
    return details;
  });

  // Process <Link> components for .mdx files (async)
  html = await processLinkComponents(html, filename, config);

  // Unwrap <p> tags around standalone <details> (link embeds)
  // Must happen AFTER processLinkComponents since that's when link-embed HTML is generated
  html = html.replace(/<p>\s*(<details class="link-emb[^>]*>[\s\S]*?<\/details>)\s*<\/p>/gi, '$1');
  html = html.replace(/<p>([\s\S]*?)\s*(<details class="link-emb[^>]*>[\s\S]*?<\/details>)\s*<\/p>/gi, function(match, text, details) {
    if (text.trim().length > 0) {
      return `<p>${text}</p>${details}`;
    }
    return details;
  });

  return {
    frontmatter,
    contentHtml: html,
    content: contentBody,
    filename,
    slug: frontmatter.slug || generateSlug(filename)
  };
}

export { parseMarkdown };
