/**
 * HTTP server for the Jawi admin panel.
 *
 * Serves:
 *   - The admin SPA (static files from ./public)
 *   - A JSON API for content CRUD, tags, images, config, trash, audit, stats
 *
 * Security:
 *   - Binds to 127.0.0.1 by default
 *   - Token auth with HttpOnly SameSite=Strict session cookies
 *   - Origin/Referer check on mutating requests (CSRF defense)
 *   - JSON body size limit
 *   - Path traversal protection on all file access
 */

import http from 'http';
import { readFile, stat } from 'fs/promises';
import { extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createAuthManager } from './auth.js';
import { createContentStore } from './store.js';
import { createImageStore } from './images.js';
import { createConfigStore } from './config-store.js';
import { createTagManager } from './tags.js';
import { createAuditLogger } from './audit.js';
import { createPreviewRenderer } from './preview.js';
import { loadConfig } from '../config.js';
import { parseUTC, utcNow } from '../utils/timezone.js';
import { normalizeTag } from '../utils/normalizeTag.js';
import { getVersion } from '../version.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, 'public');

const MAX_JSON_BODY = 15 * 1024 * 1024; // 15 MB (base64 image uploads)

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Parse a JSON request body with a size limit.
 * @returns {Promise<Object>}
 */
function readJsonBody(req) {
  return new Promise((resolvePromise, rejectPromise) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_JSON_BODY) {
        rejectPromise(Object.assign(new Error('Request body too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        rejectPromise(Object.assign(new Error('Invalid JSON body.'), { status: 400 }));
      }
    });
    req.on('error', rejectPromise);
  });
}

/**
 * Send a JSON response.
 */
function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

/**
 * Send an error response.
 */
function sendError(res, status, message) {
  sendJson(res, status, { error: message });
}

/**
 * Check the Origin/Referer header on mutating requests (CSRF defense).
 * Allows same-origin requests and requests with no Origin (curl, same-host).
 */
function originAllowed(req, hostHeader) {
  const origin = req.headers.origin;
  if (!origin) {
    // No Origin header: allow (curl, same-origin in older browsers)
    return true;
  }
  let originHost;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  return originHost === hostHeader;
}

/**
 * Create and configure the admin server (without listening).
 * @param {Object} ctx - Server context (root, contentDir, auth, stores...)
 * @returns {http.Server}
 */
export function createAdminServer(ctx) {
  const { root, contentDir, auth, store, images, configStore, tags, preview, audit } = ctx;

  /**
   * Authenticate a request. Returns session id or null.
   */
  function authedSession(req) {
    const id = auth.sessionIdFromCookie(req.headers.cookie);
    return auth.isValidSession(id) ? id : null;
  }

  /**
   * Serve a static file from PUBLIC_DIR (SPA fallback to index.html).
   */
  async function serveStatic(req, res, urlPath) {
    let rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    // Block traversal
    if (rel.includes('..') || rel.includes('\0')) {
      sendError(res, 400, 'Bad request.');
      return;
    }
    let filePath = resolve(PUBLIC_DIR, rel);
    if (!filePath.startsWith(PUBLIC_DIR + '/') && filePath !== PUBLIC_DIR) {
      sendError(res, 403, 'Forbidden.');
      return;
    }
    try {
      const s = await stat(filePath);
      if (s.isDirectory()) {
        filePath = join(filePath, 'index.html');
        await stat(filePath);
      }
    } catch {
      // SPA fallback: unknown non-API paths get index.html
      if (!rel.includes('.')) {
        filePath = join(PUBLIC_DIR, 'index.html');
      } else {
        sendError(res, 404, 'Not found.');
        return;
      }
    }
    try {
      const data = await readFile(filePath);
      const type = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
      });
      res.end(data);
    } catch {
      sendError(res, 404, 'Not found.');
    }
  }

  // ---------- API handlers ----------

  async function handleLogin(req, res, url) {
    const { token } = await readJsonBody(req);
    if (!auth.verifyToken(token, ctx.token)) {
      sendError(res, 401, 'Invalid token.');
      return;
    }
    const sessionId = auth.createSession();
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `${auth.COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${12 * 60 * 60}`,
    });
  }

  async function handleLogout(req, res, url) {
    const id = authedSession(req);
    auth.destroySession(id);
    sendJson(res, 200, { ok: true }, {
      'Set-Cookie': `${auth.COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
    });
  }

  async function handleMe(req, res, url) {
    const id = authedSession(req);
    sendJson(res, 200, {
      authed: !!id,
      version: getVersion(),
      siteTitle: ctx.config?.site?.title || 'Jawi',
    });
  }

  /**
   * GET /api/items?type=&search=&tag=&draft=&sort=
   */
  async function handleListItems(req, res, url) {
    const params = url.searchParams;
    const type = params.get('type');
    const search = (params.get('search') || '').toLowerCase();
    const tag = params.get('tag') ? normalizeTag(params.get('tag')) : null;
    const draft = params.get('draft');
    const sort = params.get('sort') || 'time-desc';

    const types = type && ['post', 'thought', 'code'].includes(type) ? [type] : ['post', 'thought', 'code'];
    let items = [];
    for (const t of types) {
      items = items.concat(await store.listItems(t));
    }

    if (search) {
      items = items.filter(i =>
        (i.title || '').toLowerCase().includes(search) ||
        (i.excerpt || '').toLowerCase().includes(search) ||
        (i.tags || []).some(t => t.toLowerCase().includes(search))
      );
    }
    if (tag) {
      items = items.filter(i => (i.tags || []).some(t => normalizeTag(String(t)) === tag));
    }
    if (draft === 'true') items = items.filter(i => i.draft);
    if (draft === 'false') items = items.filter(i => !i.draft);

    if (sort === 'time-asc') items.reverse();
    else if (sort === 'title') items.sort((a, b) => String(a.title).localeCompare(String(b.title)));

    sendJson(res, 200, { items, total: items.length });
  }

  /**
   * GET /api/items/:type/:slug
   */
  async function handleGetItem(req, res, url, type, slug) {
    const item = await store.readItem(type, slug);
    if (!item) {
      sendError(res, 404, `Item not found: ${type}/${slug}`);
      return;
    }
    // Render preview HTML server-side for exact build parity
    let html = '';
    try {
      if (type === 'code') {
        html = preview.renderCode(item.body, item.language);
      } else {
        html = await preview.renderMarkdown(item.body, item.filename);
      }
    } catch (e) {
      html = `<p><em>Preview unavailable: ${e.message}</em></p>`;
    }
    sendJson(res, 200, { item: { ...item, html } });
  }

  /**
   * POST /api/items
   */
  async function handleCreateItem(req, res, url) {
    const input = await readJsonBody(req);
    const { item } = await store.createItem(input);
    sendJson(res, 201, { item });
  }

  /**
   * PUT /api/items/:type/:slug
   */
  async function handleUpdateItem(req, res, url, type, slug) {
    const input = await readJsonBody(req);
    const { item, backup } = await store.updateItem(type, slug, input);
    sendJson(res, 200, { item, backup });
  }

  /**
   * DELETE /api/items/:type/:slug  (soft delete -> trash)
   */
  async function handleDeleteItem(req, res, url, type, slug) {
    const { trashId } = await store.trashItem(type, slug);
    sendJson(res, 200, { ok: true, trashId });
  }

  /**
   * POST /api/items/:type/:slug/duplicate
   */
  async function handleDuplicateItem(req, res, url, type, slug) {
    const { item } = await store.duplicateItem(type, slug, utcNow());
    sendJson(res, 201, { item });
  }

  /**
   * POST /api/items/:type/:slug/toggle-draft
   */
  async function handleToggleDraft(req, res, url, type, slug) {
    const { item } = await store.toggleDraft(type, slug);
    sendJson(res, 200, { item });
  }

  /**
   * POST /api/preview  { type, body, language? }
   */
  async function handlePreview(req, res, url) {
    const { type, body, language } = await readJsonBody(req);
    let html;
    if (type === 'code') {
      html = preview.renderCode(body, language || 'text');
    } else {
      html = await preview.renderMarkdown(body, 'preview.md');
    }
    sendJson(res, 200, { html });
  }

  /**
   * GET /api/tags
   */
  async function handleTags(req, res, url) {
    const data = await tags.getTagsWithCounts();
    sendJson(res, 200, data);
  }

  /**
   * POST /api/tags/rename  { from, to }
   */
  async function handleTagRename(req, res, url) {
    const { from, to } = await readJsonBody(req);
    const result = await tags.renameTag(from, to);
    sendJson(res, 200, result);
  }

  /**
   * DELETE /api/tags/:tag
   */
  async function handleTagRemove(req, res, url, tag) {
    const result = await tags.removeTag(tag);
    sendJson(res, 200, result);
  }

  /**
   * GET /api/tags/:tag/items
   */
  async function handleTagItems(req, res, url, tag) {
    const items = await tags.findItemsWithTag(tag);
    sendJson(res, 200, { items });
  }

  /**
   * GET /api/images
   */
  async function handleListImages(req, res, url) {
    const imagesList = await images.listImages();
    sendJson(res, 200, { images: imagesList, total: imagesList.length });
  }

  /**
   * POST /api/images  { filename, dataBase64, month? }
   */
  async function handleUploadImage(req, res, url) {
    const input = await readJsonBody(req);
    const result = await images.uploadImage(input);
    sendJson(res, 201, result);
  }

  /**
   * DELETE /api/images  { path }
   */
  async function handleDeleteImage(req, res, url) {
    const { path } = await readJsonBody(req);
    await images.deleteImage(path);
    sendJson(res, 200, { ok: true });
  }

  /**
   * GET /api/images/preview?path=images/2026-05/x.jpg
   */
  async function handleImagePreview(req, res, url) {
    const relPath = url.searchParams.get('path') || '';
    const result = await images.readImage(relPath);
    if (!result) {
      sendError(res, 404, 'Image not found.');
      return;
    }
    res.writeHead(200, {
      'Content-Type': result.contentType,
      'Content-Length': result.buffer.length,
      'Cache-Control': 'no-cache',
    });
    res.end(result.buffer);
  }

  /**
   * GET /api/config
   */
  async function handleGetConfig(req, res, url) {
    const data = await configStore.readConfig();
    sendJson(res, 200, data);
  }

  /**
   * PUT /api/config
   */
  async function handlePutConfig(req, res, url) {
    const patch = await readJsonBody(req);
    const result = await configStore.writeConfig(patch);
    // Reload effective config for subsequent requests
    ctx.config = result.config;
    sendJson(res, 200, result);
  }

  /**
   * GET /api/trash
   */
  async function handleListTrash(req, res, url) {
    const entries = await store.listTrash();
    sendJson(res, 200, { entries });
  }

  /**
   * POST /api/trash/:trashId/restore
   */
  async function handleRestoreTrash(req, res, url, trashId) {
    await store.restoreTrash(trashId);
    sendJson(res, 200, { ok: true });
  }

  /**
   * DELETE /api/trash/:trashId
   */
  async function handlePurgeTrash(req, res, url, trashId) {
    await store.purgeTrash(trashId);
    sendJson(res, 200, { ok: true });
  }

  /**
   * GET /api/audit?limit=
   */
  async function handleAudit(req, res, url) {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    const entries = await audit.recent(limit);
    sendJson(res, 200, { entries });
  }

  /**
   * GET /api/stats
   */
  async function handleStats(req, res) {
    const [posts, thoughts, codes] = await Promise.all([
      store.listItems('post'),
      store.listItems('thought'),
      store.listItems('code'),
    ]);
    const tagData = await tags.getTagsWithCounts();
    const trash = await store.listTrash();

    const recent = [
      ...posts.map(i => ({ ...i, type: 'post' })),
      ...thoughts.map(i => ({ ...i, type: 'thought' })),
      ...codes.map(i => ({ ...i, type: 'code' })),
    ]
      .sort((a, b) => {
        const ta = a.time ? parseUTC(a.time).getTime() : 0;
        const tb = b.time ? parseUTC(b.time).getTime() : 0;
        return tb - ta;
      })
      .slice(0, 8);

    sendJson(res, 200, {
      counts: {
        post: posts.length,
        thought: thoughts.length,
        code: codes.length,
        drafts: posts.filter(i => i.draft).length + thoughts.filter(i => i.draft).length + codes.filter(i => i.draft).length,
        tags: tagData.tags.length,
        trash: trash.length,
      },
      recent,
      topTags: tagData.tags
        .map(t => ({ tag: t, count: tagData.counts[t] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    });
  }

  // ---------- Router ----------

  const routes = [
    { method: 'POST', pattern: /^\/api\/login$/, handler: handleLogin, auth: false },
    { method: 'GET', pattern: /^\/api\/me$/, handler: handleMe, auth: false },
    { method: 'POST', pattern: /^\/api\/logout$/, handler: handleLogout, auth: false },

    { method: 'GET', pattern: /^\/api\/items$/, handler: handleListItems },
    { method: 'POST', pattern: /^\/api\/items$/, handler: handleCreateItem },
    { method: 'GET', pattern: /^\/api\/items\/(post|thought|code)\/([\w-]+)$/, handler: handleGetItem },
    { method: 'PUT', pattern: /^\/api\/items\/(post|thought|code)\/([\w-]+)$/, handler: handleUpdateItem },
    { method: 'DELETE', pattern: /^\/api\/items\/(post|thought|code)\/([\w-]+)$/, handler: handleDeleteItem },
    { method: 'POST', pattern: /^\/api\/items\/(post|thought|code)\/([\w-]+)\/duplicate$/, handler: handleDuplicateItem },
    { method: 'POST', pattern: /^\/api\/items\/(post|thought|code)\/([\w-]+)\/toggle-draft$/, handler: handleToggleDraft },

    { method: 'POST', pattern: /^\/api\/preview$/, handler: handlePreview },

    { method: 'GET', pattern: /^\/api\/tags$/, handler: handleTags },
    { method: 'POST', pattern: /^\/api\/tags\/rename$/, handler: handleTagRename },
    { method: 'DELETE', pattern: /^\/api\/tags\/([\w-]+)$/, handler: handleTagRemove },
    { method: 'GET', pattern: /^\/api\/tags\/([\w-]+)\/items$/, handler: handleTagItems },

    { method: 'GET', pattern: /^\/api\/images$/, handler: handleListImages },
    { method: 'POST', pattern: /^\/api\/images$/, handler: handleUploadImage },
    { method: 'DELETE', pattern: /^\/api\/images$/, handler: handleDeleteImage },
    { method: 'GET', pattern: /^\/api\/images\/preview$/, handler: handleImagePreview },

    { method: 'GET', pattern: /^\/api\/config$/, handler: handleGetConfig },
    { method: 'PUT', pattern: /^\/api\/config$/, handler: handlePutConfig },

    { method: 'GET', pattern: /^\/api\/trash$/, handler: handleListTrash },
    { method: 'POST', pattern: /^\/api\/trash\/([\w.-]+)\/restore$/, handler: handleRestoreTrash },
    { method: 'DELETE', pattern: /^\/api\/trash\/([\w.-]+)$/, handler: handlePurgeTrash },

    { method: 'GET', pattern: /^\/api\/audit$/, handler: handleAudit },
    { method: 'GET', pattern: /^\/api\/stats$/, handler: handleStats },
  ];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const path = url.pathname;

    try {
      if (path.startsWith('/api/')) {
        const route = routes.find(r => r.method === req.method && r.pattern.test(path));
        if (!route) {
          sendError(res, 404, 'Unknown API endpoint.');
          return;
        }

        // Auth (login/me are public)
        if (route.auth !== false) {
          if (!authedSession(req)) {
            sendError(res, 401, 'Not authenticated.');
            return;
          }
          // CSRF: mutating requests must come from the same origin
          if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method) && !originAllowed(req, req.headers.host)) {
            sendError(res, 403, 'Origin not allowed.');
            return;
          }
        }

        const match = path.match(route.pattern);
        const handlerArgs = [req, res, url, ...match.slice(1)];
        await route.handler(...handlerArgs);
        return;
      }

      // Static SPA
      await serveStatic(req, res, path);
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) {
        console.error(`[jawi-admin] ${req.method} ${path} failed:`, err);
      }
      if (!res.headersSent) {
        sendError(res, status, err.message || 'Internal server error.');
      } else {
        res.end();
      }
    }
  });

  return server;
}
