/**
 * Image management for the Jawi admin panel.
 *
 * Images live in <root>/public/images/YYYY-MM/ (same convention as the
 * `jawi add-image` CLI). Uploads are base64 JSON (no multipart parsing),
 * validated by extension and size, and written atomically.
 */

import { mkdir, readdir, readFile, rm, stat, writeFile } from 'fs/promises';
import { basename, extname, join, resolve } from 'path';

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg']);
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Create an image store bound to a project.
 * @param {Object} opts
 * @param {string} opts.root - Project root
 * @param {Object} opts.audit - Audit logger
 * @param {number} [opts.maxBytes] - Max upload size
 */
export function createImageStore({ root, audit, maxBytes = DEFAULT_MAX_BYTES }) {
  const imagesRoot = join(root, 'public', 'images');

  function currentMonthDir() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Validate a relative image path (e.g. "2026-05/photo.jpg") against the
   * images root. Returns the absolute path or throws.
   */
  function resolveImagePath(relPath) {
    if (typeof relPath !== 'string' || relPath.length === 0) {
      throw new Error('Image path is required.');
    }
    if (relPath.startsWith('/') || relPath.includes('..')) {
      throw new Error('Invalid image path.');
    }
    const abs = resolve(imagesRoot, relPath);
    if (!abs.startsWith(imagesRoot + '/') && abs !== imagesRoot) {
      throw new Error('Invalid image path.');
    }
    return abs;
  }

  /**
   * List all images recursively with metadata.
   * @returns {Promise<Array<{path: string, size: number, mtime: string}>>}
   *   path is relative to public/ (e.g. "images/2026-05/photo.jpg")
   */
  async function listImages() {
    const out = [];
    async function walk(dir, rel) {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const abs = join(dir, entry.name);
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          await walk(abs, relPath);
        } else if (entry.isFile() && ALLOWED_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
          try {
            const s = await stat(abs);
            out.push({
              path: relPath,
              url: `/${relPath}`,
              size: s.size,
              mtime: s.mtime.toISOString(),
            });
          } catch {
            // File vanished mid-scan
          }
        }
      }
    }
    await walk(imagesRoot, 'images');
    out.sort((a, b) => b.mtime.localeCompare(a.mtime));
    return out;
  }

  /**
   * Upload an image from base64 data.
   * @param {Object} input - { filename, dataBase64, month? }
   * @returns {Promise<{url: string, path: string, size: number}>}
   */
  async function uploadImage({ filename, dataBase64, month }) {
    if (typeof dataBase64 !== 'string' || dataBase64.length === 0) {
      throw new Error('dataBase64 is required.');
    }
    const rawName = String(filename || 'image.png');
    if (rawName.includes('/') || rawName.includes('\\') || rawName.includes('..')) {
      throw new Error('Invalid filename.');
    }
    const name = basename(rawName).replace(/[^\w.\-]/g, '_');
    const ext = extname(name).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      throw new Error(`Unsupported image type "${ext || '(none)'}". Allowed: ${[...ALLOWED_EXTENSIONS].join(', ')}`);
    }

    const buffer = Buffer.from(dataBase64, 'base64');
    if (buffer.length === 0) throw new Error('Uploaded data is empty.');
    if (buffer.length > maxBytes) {
      throw new Error(`Image exceeds the ${Math.round(maxBytes / 1024 / 1024)} MB limit.`);
    }

    const monthDir = month || currentMonthDir();
    if (!/^\d{4}-\d{2}$/.test(monthDir)) throw new Error('Invalid month directory.');

    const destDir = join(imagesRoot, monthDir);
    await mkdir(destDir, { recursive: true });

    // Avoid clobbering: append -1, -2, ... on collision
    let destName = name;
    let destPath = join(destDir, destName);
    let n = 1;
    while (true) {
      try {
        await stat(destPath);
        destName = name.replace(/(\.[^.]+)$/, `-${n++}$1`);
        destPath = join(destDir, destName);
      } catch {
        break;
      }
    }

    await writeFile(destPath, buffer);
    const relPath = `images/${monthDir}/${destName}`;

    await audit?.record('image-upload', { path: relPath, size: buffer.length });
    return { path: relPath, url: `/${relPath}`, size: buffer.length };
  }

  /**
   * Delete an image.
   * @param {string} relPath - Relative to public/ (e.g. "images/2026-05/photo.jpg")
   */
  async function deleteImage(relPath) {
    const abs = resolveImagePath(relPath.replace(/^\/?images\//, ''));
    try {
      await stat(abs);
    } catch {
      throw new Error(`Image not found: ${relPath}`);
    }
    await rm(abs);
    await audit?.record('image-delete', { path: relPath });
    return { ok: true };
  }

  /**
   * Read an image file (for thumbnail previews). Returns { buffer, contentType } or null.
   * @param {string} relPath - Relative to public/
   */
  async function readImage(relPath) {
    let abs;
    try {
      abs = resolveImagePath(String(relPath || '').replace(/^\/?images\//, ''));
    } catch {
      return null; // invalid / traversal path
    }
    try {
      const s = await stat(abs);
      if (!s.isFile()) return null;
      const buffer = await readFile(abs);
      const ext = extname(abs).toLowerCase();
      const contentTypes = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
        '.svg': 'image/svg+xml',
      };
      return { buffer, contentType: contentTypes[ext] || 'application/octet-stream' };
    } catch {
      return null;
    }
  }

  return { listImages, uploadImage, deleteImage, readImage, imagesRoot };
}
