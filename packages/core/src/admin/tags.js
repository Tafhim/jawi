/**
 * Tag management for the Jawi admin panel.
 *
 * Tags live in the frontmatter of every content file. Renaming or removing
 * a tag rewrites every affected file (with backups, via the content store).
 */

import { normalizeTag } from '../utils/normalizeTag.js';

/**
 * Create a tag manager bound to a content store.
 * @param {Object} opts
 * @param {Object} opts.store - Content store (createContentStore result)
 * @param {Object} opts.audit - Audit logger
 */
export function createTagManager({ store, audit }) {
  /**
   * All unique tags with per-type counts.
   * @returns {Promise<{tags: string[], counts: Object, byType: Object}>}
   */
  async function getTagsWithCounts() {
    const counts = {};
    const byType = { post: {}, thought: {}, code: {} };

    for (const type of ['post', 'thought', 'code']) {
      const items = await store.listItems(type);
      for (const item of items) {
        const seen = new Set();
        for (const raw of item.tags || []) {
          const t = normalizeTag(String(raw));
          if (!t || seen.has(t)) continue;
          seen.add(t);
          counts[t] = (counts[t] || 0) + 1;
          byType[type][t] = (byType[type][t] || 0) + 1;
        }
      }
    }

    const tags = Object.keys(counts).sort();
    return { tags, counts, byType };
  }

  /**
   * Find which items carry a given tag.
   * @param {string} tag
   * @returns {Promise<Array<{type: string, slug: string, title: string}>>}
   */
  async function findItemsWithTag(tag) {
    const target = normalizeTag(tag);
    const out = [];
    for (const type of ['post', 'thought', 'code']) {
      const items = await store.listItems(type);
      for (const item of items) {
        if ((item.tags || []).some(t => normalizeTag(String(t)) === target)) {
          out.push({ type, slug: item.slug, title: item.title, filename: item.filename });
        }
      }
    }
    return out;
  }

  /**
   * Rename a tag across all content files.
   * @param {string} from
   * @param {string} to
   * @returns {Promise<{updated: number, files: string[]}>}
   */
  async function renameTag(from, to) {
    const fromNorm = normalizeTag(from);
    const toNorm = normalizeTag(to);
    if (!fromNorm) throw new Error('Source tag is required.');
    if (!toNorm) throw new Error('New tag is required.');
    if (fromNorm === toNorm) throw new Error('New tag is the same as the old tag.');

    const affected = await findItemsWithTag(fromNorm);
    if (affected.length === 0) throw new Error(`No items use the tag "${fromNorm}".`);

    const files = [];
    for (const item of affected) {
      const full = await store.readItem(item.type, item.slug);
      if (!full) continue;
      const newTags = (full.tags || [])
        .map(t => (normalizeTag(String(t)) === fromNorm ? toNorm : String(t)))
        .filter((t, i, arr) => arr.indexOf(t) === i);
      await store.updateItem(item.type, item.slug, { tags: newTags });
      files.push(`${item.type}/${item.filename}`);
    }

    await audit?.record('tag-rename', { from: fromNorm, to: toNorm, files });
    return { updated: files.length, files };
  }

  /**
   * Remove a tag from all content files.
   * @param {string} tag
   * @returns {Promise<{updated: number, files: string[]}>}
   */
  async function removeTag(tag) {
    const target = normalizeTag(tag);
    if (!target) throw new Error('Tag is required.');

    const affected = await findItemsWithTag(target);
    if (affected.length === 0) throw new Error(`No items use the tag "${target}".`);

    const files = [];
    for (const item of affected) {
      const full = await store.readItem(item.type, item.slug);
      if (!full) continue;
      const newTags = (full.tags || []).filter(t => normalizeTag(String(t)) !== target);
      await store.updateItem(item.type, item.slug, { tags: newTags });
      files.push(`${item.type}/${item.filename}`);
    }

    await audit?.record('tag-remove', { tag: target, files });
    return { updated: files.length, files };
  }

  return { getTagsWithCounts, findItemsWithTag, renameTag, removeTag };
}
