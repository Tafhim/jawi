/**
 * Content store for the Jawi admin panel.
 *
 * Reads and writes the plain-Markdown content files that make up a Jawi site:
 *   <contentDir>/posts/*.md|mdx
 *   <contentDir>/thoughts/*.md|mdx
 *   <contentDir>/codes/*.md|mdx
 *
 * Robustness guarantees:
 *   - Atomic writes (write to temp file, then rename)
 *   - Per-file write queue (no interleaved writes to the same file)
 *   - Backup of the previous version before every overwrite
 *   - Soft delete: files move to .jawi-admin/trash/ with a manifest,
 *     restorable or permanently deletable
 *   - Validation of all frontmatter fields before anything touches disk
 *   - Slug collision detection on create
 */

import { randomUUID } from 'crypto';
import { existsSync } from 'fs';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from 'fs/promises';
import { basename, join, resolve } from 'path';
import { parseFrontmatter } from '../utils/parseFrontmatter.js';
import { normalizeTag } from '../utils/normalizeTag.js';
import { isDraft } from '../utils/drafts.js';
import { getExcerpt } from '../utils/getExcerpt.js';
import { parseUTC } from '../utils/timezone.js';

export const ITEM_TYPES = ['post', 'thought', 'code'];

const TYPE_DIRS = {
  post: 'posts',
  thought: 'thoughts',
  code: 'codes',
};

/** Languages supported by the build (Prism grammars registered in loadPrismLanguages.js). */
export const VALID_LANGUAGES = [
  'astro', 'bash', 'c', 'cpp', 'css', 'go', 'java', 'javascript', 'jsx',
  'json', 'markdown', 'python', 'rust', 'typescript', 'tsx', 'xml-doc',
  'yaml', 'zig',
];

const VALID_COLOR_NAMES = ['black', 'white', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];

const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

const MAX_BACKUPS_PER_SLUG = 20;

/**
 * Validate a thought color value (same rules as create-thought CLI).
 * @param {string} color
 * @returns {boolean}
 */
export function isValidColor(color) {
  if (!color) return true; // empty = default
  const c = String(color).toLowerCase();
  if (c.startsWith('solid-')) {
    const val = c.slice(6);
    if (val.startsWith('#') && /^#[0-9a-fA-F]{3,8}$/.test(val)) return true;
    return VALID_COLOR_NAMES.includes(val);
  }
  if (c.startsWith('gradient-')) {
    const stops = c.slice(9);
    if (!stops) return false;
    const tokens = stops.match(/#[0-9a-fA-F]{3,8}|\b[a-zA-Z]+\b/g);
    if (!tokens || tokens.length < 2) return false;
    return tokens.every(t => t.startsWith('#') || VALID_COLOR_NAMES.includes(t.toLowerCase()));
  }
  return VALID_COLOR_NAMES.includes(c);
}

/**
 * Validate a time string ("YYYY-MM-DD HH:MM:SS" UTC).
 * @param {string} time
 * @returns {boolean}
 */
export function isValidTime(time) {
  if (!TIME_RE.test(String(time || ''))) return false;
  const d = parseUTC(time);
  return !isNaN(d.getTime());
}

/**
 * Normalize a list of tags: trim, strip leading #, lowercase, dedupe, drop empties.
 * @param {Array|string} tags
 * @returns {string[]}
 */
export function normalizeTags(tags) {
  const list = Array.isArray(tags) ? tags : String(tags || '').split(' ');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = normalizeTag(String(raw).trim());
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Quote a frontmatter scalar value if it contains characters that could
 * confuse the line-based parser.
 */
function quoteValue(value) {
  const v = String(value);
  if (v === '') return '""';
  if (/^[\w\-./@]+$/.test(v) && !/^\d+$/.test(v)) return v;
  return JSON.stringify(v);
}

/**
 * Serialize a normalized item into the canonical file format used by the
 * CLI commands (same field order, same quoting style).
 * @param {Object} item - Normalized item (type, title, time, tags, draft, body, images?, color?, language?, mdxImportBlock?)
 * @returns {string} Full file content
 */
export function serializeItem(item) {
  const lines = ['---'];
  lines.push(`time: ${item.time}`);

  if (item.type === 'code') {
    lines.push(`draft: ${item.draft ? 'true' : 'false'}`);
    lines.push(`title: ${quoteValue(item.title)}`);
    lines.push(`language: ${item.language}`);
    lines.push('tags:');
    for (const t of item.tags) lines.push(`  - "${t}"`);
  } else if (item.type === 'thought') {
    lines.push(`slug: ${item.slug}`);
    lines.push(`draft: ${item.draft ? 'true' : 'false'}`);
    if (item.color) lines.push(`color: ${item.color}`);
    lines.push('tags:');
    for (const t of item.tags) lines.push(`  - "${t}"`);
  } else {
    // post
    lines.push(`slug: ${item.slug}`);
    lines.push(`draft: ${item.draft ? 'true' : 'false'}`);
    lines.push(`title: ${quoteValue(item.title)}`);
    lines.push('tags:');
    for (const t of item.tags) lines.push(`  - "${t}"`);
    lines.push('images:');
    for (const img of item.images || []) lines.push(`  - "${img}"`);
  }

  lines.push('---');

  if (item.type === 'code' && item.mdx === true) {
    // MDX code files keep an Astro import-block separator between the
    // frontmatter and the code body (matches create-code output).
    lines.push('');
    lines.push('---');
  }

  lines.push('');
  lines.push(item.body || '');
  lines.push('');

  return lines.join('\n');
}

/**
 * Parse a code file's raw content, separating frontmatter, the MDX import
 * block (if any), and the code body.
 * @param {string} content
 * @param {boolean} isMdx
 * @returns {{frontmatter: Object, body: string, mdxImportBlock: string|null}}
 */
function parseCodeFile(content, isMdx) {
  const { frontmatter } = parseFrontmatter(content);
  if (!isMdx) {
    // Body = everything after the second '---'
    const lines = content.split('\n');
    let dashCount = 0;
    let end = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        dashCount++;
        if (dashCount === 2) { end = i; break; }
      }
    }
    const body = end === -1 ? '' : lines.slice(end + 1).join('\n').replace(/^\n+/, '');
    return { frontmatter, body, mdxImportBlock: null };
  }

  // MDX: frontmatter, then an import block (a '---' separator, possibly with
  // import lines), then the code body.
  const lines = content.split('\n');
  let dashCount = 0;
  let fmEnd = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      dashCount++;
      if (dashCount === 2) { fmEnd = i; break; }
    }
  }
  if (fmEnd === -1) return { frontmatter, body: content, mdxImportBlock: null };

  // Find code start: first non-empty, non-'---' line after fmEnd
  let codeStart = -1;
  for (let j = fmEnd + 1; j < lines.length; j++) {
    if (lines[j].trim() && lines[j].trim() !== '---') { codeStart = j; break; }
  }
  if (codeStart === -1) {
    return { frontmatter, body: '', mdxImportBlock: '---' };
  }
  const importBlockLines = lines.slice(fmEnd + 1, codeStart);
  const mdxImportBlock = importBlockLines.join('\n').trim();
  const body = lines.slice(codeStart).join('\n');
  return { frontmatter, body, mdxImportBlock: mdxImportBlock || '---' };
}

/**
 * Create a content store bound to a project.
 * @param {Object} opts
 * @param {string} opts.root - Project root
 * @param {string} opts.contentDir - Content directory (absolute)
 * @param {Object} opts.audit - Audit logger ({ record })
 */
export function createContentStore({ root, contentDir, audit }) {
  const adminDir = join(root, '.jawi-admin');
  const backupDir = join(adminDir, 'backups');
  const trashDir = join(adminDir, 'trash');
  const trashManifestPath = join(adminDir, 'trash-manifest.json');

  /** Serialize a code file with its MDX import block. */
  function serializeCodeFile(item) {
    const base = serializeItem({ ...item, mdx: false });
    if (item.mdx !== true) return base;
    // Rebuild with import block: frontmatter block + blank + import block + blank + body
    const fmBlock = base.split('\n---\n')[0]; // '---\n...\n---'
    const body = (item.body || '').replace(/\n+$/, '');
    const importBlock = item.mdxImportBlock || '---';
    return `${fmBlock}\n\n${importBlock}\n\n${body}\n`;
  }

  /**
   * Per-file write queue: chains writes to the same path so concurrent
   * requests never interleave.
   */
  const writeQueues = new Map();
  function enqueueWrite(path, fn) {
    const prev = writeQueues.get(path) || Promise.resolve();
    const next = prev.then(fn, fn);
    writeQueues.set(path, next.catch(() => {}));
    return next;
  }

  /**
   * Atomically write a file (temp + rename).
   */
  async function atomicWrite(filePath, content) {
    const dir = join(filePath, '..');
    await mkdir(dir, { recursive: true });
    const tmp = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, content, 'utf8');
    await rename(tmp, filePath);
  }

  /**
   * Back up an existing file before overwriting it.
   */
  async function backupFile(filePath) {
    try {
      await stat(filePath);
    } catch {
      return null; // Nothing to back up
    }
    await mkdir(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(backupDir, `${basename(filePath)}.${stamp}.bak`);
    await copyFile(filePath, backupPath);

    // Prune: keep the most recent MAX_BACKUPS_PER_SLUG per base name
    const files = await readdir(backupDir);
    const mine = files
      .filter(f => f.startsWith(`${basename(filePath)}.`) && f.endsWith('.bak'))
      .sort();
    while (mine.length > MAX_BACKUPS_PER_SLUG) {
      const oldest = mine.shift();
      await rm(join(backupDir, oldest), { force: true }).catch(() => {});
    }
    return backupPath;
  }

  /**
   * Resolve the directory for an item type.
   */
  function typeDir(type) {
    return join(contentDir, TYPE_DIRS[type]);
  }

  /**
   * List all files for an item type (including drafts).
   */
  async function listFiles(type) {
    const dir = typeDir(type);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      return [];
    }
    return entries.filter(f => f.endsWith('.md') || f.endsWith('.mdx'));
  }

  /**
   * Read a single item from disk (drafts included).
   * Accepts either a filename ("abc.md") or a slug ("abc").
   * @returns {Promise<Object|null>} Normalized item or null
   */
  async function readItem(type, slugOrFilename) {
    let filename = slugOrFilename;
    if (!/\.(md|mdx)$/.test(slugOrFilename)) {
      // Slug: try .md first, then .mdx
      const candidates = [`${slugOrFilename}.md`, `${slugOrFilename}.mdx`];
      const found = candidates.find(f => existsSync(join(typeDir(type), f)));
      if (!found) return null;
      filename = found;
    }
    const filePath = join(typeDir(type), filename);
    let content;
    try {
      content = await readFile(filePath, 'utf8');
    } catch {
      return null;
    }

    const slug = filename.replace(/\.(md|mdx)$/, '');
    const isMdx = filename.endsWith('.mdx');

    if (type === 'code') {
      const { frontmatter, body, mdxImportBlock } = parseCodeFile(content, isMdx);
      return {
        type,
        filename,
        slug,
        title: frontmatter.title || slug,
        time: frontmatter.time || null,
        tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
        draft: isDraft(frontmatter),
        language: frontmatter.language || (isMdx ? 'astro' : 'text'),
        body,
        mdx: isMdx,
        mdxImportBlock,
        raw: content,
      };
    }

    const { frontmatter, body } = parseFrontmatter(content);
    const base = {
      type,
      filename,
      slug,
      time: frontmatter.time || null,
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      draft: isDraft(frontmatter),
      body,
      mdx: isMdx,
      raw: content,
    };

    if (type === 'post') {
      return {
        ...base,
        title: frontmatter.title || '',
        images: Array.isArray(frontmatter.images) ? frontmatter.images : [],
      };
    }
    // thought
    return {
      ...base,
      color: frontmatter.color || '',
    };
  }

  /**
   * List items of a type as summary rows (no full body).
   * @param {string} type
   * @returns {Promise<Array>}
   */
  async function listItems(type) {
    const files = await listFiles(type);
    const items = [];
    for (const file of files) {
      const item = await readItem(type, file);
      if (!item) continue;
      items.push({
        type: item.type,
        filename: item.filename,
        slug: item.slug,
        title: item.title || item.slug,
        time: item.time,
        tags: item.tags,
        draft: item.draft,
        language: item.language,
        color: item.color,
        images: item.images,
        mdx: item.mdx,
        excerpt: getExcerpt(item.body || '', 140),
      });
    }
    items.sort((a, b) => {
      const ta = a.time ? parseUTC(a.time).getTime() : 0;
      const tb = b.time ? parseUTC(b.time).getTime() : 0;
      return tb - ta;
    });
    return items;
  }

  /**
   * Validate a normalized item before writing.
   * @returns {string[]} List of validation errors (empty = valid)
   */
  function validateItem(item) {
    const errors = [];
    if (!ITEM_TYPES.includes(item.type)) {
      errors.push(`Unknown item type "${item.type}".`);
      return errors;
    }
    if (!isValidTime(item.time)) {
      errors.push('Invalid time. Expected UTC format "YYYY-MM-DD HH:MM:SS".');
    }
    if (item.type === 'post' && !String(item.title || '').trim()) {
      errors.push('Posts require a title.');
    }
    if (item.type === 'code') {
      if (!String(item.title || '').trim()) errors.push('Code snippets require a title.');
      if (!VALID_LANGUAGES.includes(item.language)) {
        errors.push(`Invalid language "${item.language}". Valid: ${VALID_LANGUAGES.join(', ')}`);
      }
    }
    if (item.type === 'thought' && !isValidColor(item.color)) {
      errors.push(`Invalid color "${item.color}". Examples: solid-blue, gradient-red-purple, gradient-#000-#fff`);
    }
    if (!Array.isArray(item.tags)) {
      errors.push('tags must be an array.');
    }
    if (item.type === 'post' && !Array.isArray(item.images)) {
      errors.push('images must be an array.');
    }
    return errors;
  }

  /**
   * Create a new item.
   * @param {Object} input - { type, title, time, tags, draft, body, images?, color?, language?, mdx? }
   * @returns {Promise<{item: Object}>}
   */
  async function createItem(input) {
    const type = input.type;
    if (!ITEM_TYPES.includes(type)) throw new Error(`Unknown item type "${type}"`);

    const item = {
      type,
      slug: randomUUID().replace(/-/g, ''),
      title: String(input.title || '').trim(),
      time: input.time,
      tags: normalizeTags(input.tags),
      draft: !!input.draft,
      body: String(input.body || ''),
      images: type === 'post' ? (Array.isArray(input.images) ? input.images.map(String) : []) : undefined,
      color: type === 'thought' ? String(input.color || '') : undefined,
      language: type === 'code' ? String(input.language || 'text') : undefined,
      mdx: type === 'code' ? !!input.mdx : false,
    };

    const errors = validateItem(item);
    if (errors.length) throw new Error(errors.join(' '));

    const filename = `${item.slug}.${item.mdx === true ? 'mdx' : 'md'}`;
    const filePath = join(typeDir(type), filename);

    // Slug collision guard (filenames are the source of truth for slugs)
    try {
      await stat(filePath);
      throw new Error(`A file named ${filename} already exists.`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    const content = type === 'code' ? serializeCodeFile(item) : serializeItem(item);
    await enqueueWrite(filePath, () => atomicWrite(filePath, content));

    await audit?.record('create', { type, slug: item.slug, filename });
    return { item: await readItem(type, filename) };
  }

  /**
   * Update an existing item.
   * @param {string} type
   * @param {string} slug
   * @param {Object} input - Same shape as createItem (partial: missing keys keep current values)
   * @returns {Promise<{item: Object, backup: string|null}>}
   */
  async function updateItem(type, slug, input) {
    const files = await listFiles(type);
    const filename = files.find(f => f.replace(/\.(md|mdx)$/, '') === slug);
    if (!filename) throw new Error(`Item not found: ${type}/${slug}`);

    const current = await readItem(type, filename);
    if (!current) throw new Error(`Item not found: ${type}/${slug}`);

    const item = {
      type,
      slug: current.slug,
      title: input.title !== undefined ? String(input.title).trim() : current.title,
      time: input.time !== undefined ? input.time : current.time,
      tags: input.tags !== undefined ? normalizeTags(input.tags) : current.tags,
      draft: input.draft !== undefined ? !!input.draft : current.draft,
      body: input.body !== undefined ? String(input.body) : current.body,
      images: input.images !== undefined
        ? (Array.isArray(input.images) ? input.images.map(String) : [])
        : (current.images || []),
      color: input.color !== undefined ? String(input.color) : (current.color || ''),
      language: input.language !== undefined ? String(input.language) : current.language,
      mdx: current.mdx,
      mdxImportBlock: current.mdxImportBlock,
    };

    const errors = validateItem(item);
    if (errors.length) throw new Error(errors.join(' '));

    const filePath = join(typeDir(type), filename);
    const content = type === 'code' ? serializeCodeFile(item) : serializeItem(item);

    let backupPath = null;
    await enqueueWrite(filePath, async () => {
      backupPath = await backupFile(filePath);
      await atomicWrite(filePath, content);
    });

    await audit?.record('update', { type, slug, filename, backup: backupPath });
    return { item: await readItem(type, filename), backup: backupPath };
  }

  /**
   * Soft-delete an item: move it to the trash with a manifest entry.
   * @returns {Promise<{trashId: string}>}
   */
  async function trashItem(type, slug) {
    const files = await listFiles(type);
    const filename = files.find(f => f.replace(/\.(md|mdx)$/, '') === slug);
    if (!filename) throw new Error(`Item not found: ${type}/${slug}`);

    const filePath = join(typeDir(type), filename);
    const item = await readItem(type, filename);

    await mkdir(trashDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const trashId = `${stamp}-${type}-${slug}`;
    const trashPath = join(trashDir, `${trashId}${filename.endsWith('.mdx') ? '.mdx' : '.md'}`);

    await rename(filePath, trashPath);

    // Update manifest
    let manifest = [];
    try {
      manifest = JSON.parse(await readFile(trashManifestPath, 'utf8'));
    } catch {
      manifest = [];
    }
    manifest.push({
      trashId,
      type,
      slug,
      filename,
      title: item?.title || slug,
      trashedAt: new Date().toISOString(),
      trashPath: basename(trashPath),
    });
    await writeFile(trashManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    await audit?.record('trash', { type, slug, filename, trashId });
    return { trashId };
  }

  /**
   * List trashed items (newest first).
   */
  async function listTrash() {
    let manifest = [];
    try {
      manifest = JSON.parse(await readFile(trashManifestPath, 'utf8'));
    } catch {
      manifest = [];
    }
    return manifest.slice().reverse();
  }

  /**
   * Restore a trashed item to its original location.
   */
  async function restoreTrash(trashId) {
    let manifest = [];
    try {
      manifest = JSON.parse(await readFile(trashManifestPath, 'utf8'));
    } catch {
      manifest = [];
    }
    const entry = manifest.find(e => e.trashId === trashId);
    if (!entry) throw new Error(`Trash entry not found: ${trashId}`);

    const trashPath = join(trashDir, entry.trashPath);
    const destPath = join(typeDir(entry.type), entry.filename);

    try {
      await stat(destPath);
      throw new Error(`Cannot restore: ${entry.filename} already exists in ${TYPE_DIRS[entry.type]}/`);
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }

    await mkdir(typeDir(entry.type), { recursive: true });
    await rename(trashPath, destPath);

    manifest = manifest.filter(e => e.trashId !== trashId);
    await writeFile(trashManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    await audit?.record('restore', { type: entry.type, slug: entry.slug, trashId });
    return { ok: true };
  }

  /**
   * Permanently delete a trashed item.
   */
  async function purgeTrash(trashId) {
    let manifest = [];
    try {
      manifest = JSON.parse(await readFile(trashManifestPath, 'utf8'));
    } catch {
      manifest = [];
    }
    const entry = manifest.find(e => e.trashId === trashId);
    if (!entry) throw new Error(`Trash entry not found: ${trashId}`);

    await rm(join(trashDir, entry.trashPath), { force: true });
    manifest = manifest.filter(e => e.trashId !== trashId);
    await writeFile(trashManifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    await audit?.record('purge', { type: entry.type, slug: entry.slug, trashId });
    return { ok: true };
  }

  /**
   * Duplicate an item (new slug, same content, time = now).
   */
  async function duplicateItem(type, slug, now) {
    const item = await readItem(type, slug);
    if (!item) throw new Error(`Item not found: ${type}/${slug}`);
    const { item: created } = await createItem({
      type,
      title: item.title ? `${item.title} (copy)` : '',
      time: now,
      tags: item.tags,
      draft: true, // duplicates start as drafts
      body: item.body,
      images: item.images,
      color: item.color,
      language: item.language,
      mdx: item.mdx,
    });
    await audit?.record('duplicate', { type, slug, newSlug: created.slug });
    return { item: created };
  }

  /**
   * Toggle the draft flag on an item.
   */
  async function toggleDraft(type, slug) {
    const item = await readItem(type, slug);
    if (!item) throw new Error(`Item not found: ${type}/${slug}`);
    const { item: updated } = await updateItem(type, slug, { draft: !item.draft });
    return { item: updated };
  }

  return {
    typeDir,
    listFiles,
    readItem,
    listItems,
    createItem,
    updateItem,
    trashItem,
    listTrash,
    restoreTrash,
    purgeTrash,
    duplicateItem,
    toggleDraft,
    validateItem,
    serializeItem,
    isValidColor,
    isValidTime,
    normalizeTags,
    adminDir,
    backupDir,
    trashDir,
  };
}
