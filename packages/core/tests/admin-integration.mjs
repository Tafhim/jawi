#!/usr/bin/env node
/**
 * Integration test for the Jawi admin panel.
 *
 * Spins up the admin server against a temporary site and exercises the full
 * API surface: auth, content CRUD, drafts, trash, tags, images, config,
 * audit, preview, and security (path traversal, CSRF, body limits).
 *
 * Run: node packages/core/tests/admin-integration.mjs
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CORE_PKG = resolve(__dirname, '..');
const TEST_DIR = join(__dirname, 'test-admin-integration');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
}

// ---------- Setup: temporary site ----------

cleanup();
mkdirSync(join(TEST_DIR, 'content', 'posts'), { recursive: true });
mkdirSync(join(TEST_DIR, 'content', 'thoughts'), { recursive: true });
mkdirSync(join(TEST_DIR, 'content', 'codes'), { recursive: true });
mkdirSync(join(TEST_DIR, 'public', 'images'), { recursive: true });

writeFileSync(join(TEST_DIR, 'jawi.config.mjs'), `export default {
  site: { title: 'Test Blog', footer: 'Test Blog', url: '' },
  content: { dir: './content', postsPerPage: 9, thoughtsPerPage: 9, tagsPerPage: 50 },
  display: { timezone: 'UTC', dateFormat: 'long' },
};
`);

// Seed content
writeFileSync(join(TEST_DIR, 'content/posts/seed-post.md'), `---
time: 2026-05-01 10:00:00
slug: seedpost
draft: false
title: Seed Post
tags:
  - "coding"
images:
  - "/images/placeholder.jpg"
---

## Hello

Seed post body.
`);

writeFileSync(join(TEST_DIR, 'content/thoughts/seed-thought.md'), `---
time: 2026-05-02 11:00:00
slug: seedthought
draft: false
color: solid-blue
tags:
  - "random"
---

A seed thought.
`);

writeFileSync(join(TEST_DIR, 'content/codes/seed-code.md'), `---
time: 2026-05-03 12:00:00
draft: false
title: Seed Code
language: python
tags:
  - "python"
---

print("hello")
`);

// ---------- Start server ----------

const { startAdminServer } = await import(join(CORE_PKG, 'src/admin/index.js'));

const TOKEN = 'test-token-1234567890abcdef';
const { server, port } = await startAdminServer({
  root: TEST_DIR,
  port: 0, // random free port
  token: TOKEN,
  quiet: true,
});

const BASE = `http://127.0.0.1:${port}`;

let cookie = '';

async function api(method, path, body, opts = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...opts.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-json */ }
  return { status: res.status, data, headers: res.headers };
}

// ============================================================
console.log('\n[1] Auth');
// ============================================================

{
  const me = await api('GET', '/api/me');
  assert(me.status === 200 && me.data.authed === false, 'GET /api/me unauthenticated -> authed:false');

  const bad = await api('POST', '/api/login', { token: 'wrong-token-00000000000000' });
  assert(bad.status === 401, 'login with wrong token -> 401');

  const noAuth = await api('GET', '/api/items');
  assert(noAuth.status === 401, 'GET /api/items without session -> 401');

  const good = await api('POST', '/api/login', { token: TOKEN });
  assert(good.status === 200, 'login with correct token -> 200');
  const setCookie = good.headers.get('set-cookie') || '';
  assert(setCookie.includes('jawi_admin_session=') && setCookie.includes('HttpOnly') && setCookie.includes('SameSite=Strict'),
    'session cookie is HttpOnly + SameSite=Strict');
  cookie = setCookie.split(';')[0];

  const me2 = await api('GET', '/api/me');
  assert(me2.status === 200 && me2.data.authed === true, 'GET /api/me authenticated -> authed:true');
  assert(me2.data.siteTitle === 'Test Blog', 'site title from config');
}

// ============================================================
console.log('\n[2] Stats + list');
// ============================================================

{
  const stats = await api('GET', '/api/stats');
  assert(stats.status === 200, 'GET /api/stats -> 200');
  assert(stats.data.counts.post === 1 && stats.data.counts.thought === 1 && stats.data.counts.code === 1,
    'stats counts match seed content');
  assert(stats.data.counts.drafts === 0, 'no drafts in seed content');
  assert(stats.data.topTags.length === 3, 'three unique tags in seed content');

  const all = await api('GET', '/api/items');
  assert(all.status === 200 && all.data.total === 3, 'list all items -> 3');

  const posts = await api('GET', '/api/items?type=post');
  assert(posts.data.total === 1 && posts.data.items[0].slug === 'seed-post', 'filter by type=post');

  const search = await api('GET', '/api/items?search=seed+thought');
  assert(search.data.total === 1 && search.data.items[0].type === 'thought', 'search by content');

  const tagFilter = await api('GET', '/api/items?tag=python');
  assert(tagFilter.data.total === 1 && tagFilter.data.items[0].type === 'code', 'filter by tag');
}

// ============================================================
console.log('\n[3] Create items');
// ============================================================

let newPostSlug = '';
let newThoughtSlug = '';
let newCodeSlug = '';

{
  const post = await api('POST', '/api/items', {
    type: 'post',
    title: 'My New Post',
    time: '2026-06-01 08:30:00',
    tags: ['Coding', '#ai', 'ai'],
    draft: false,
    body: '## Intro\n\nHello **world**.',
    images: ['/images/2026-06/a.jpg'],
  });
  assert(post.status === 201, 'create post -> 201');
  newPostSlug = post.data.item.slug;
  assert(/^[0-9a-f]{32}$/.test(newPostSlug), 'post slug is 32-char hex');
  assert(post.data.item.tags.length === 2 && post.data.item.tags.includes('ai'), 'tags normalized + deduped');

  const postFile = join(TEST_DIR, 'content/posts', `${newPostSlug}.md`);
  assert(existsSync(postFile), 'post file exists on disk');
  const postContent = readFileSync(postFile, 'utf8');
  assert(postContent.includes('title: "My New Post"'), 'post file has title');
  assert(postContent.includes('time: 2026-06-01 08:30:00'), 'post file has time');
  assert(postContent.includes('- "coding"') && postContent.includes('- "ai"'), 'post file has normalized tags');
  assert(postContent.includes('- "/images/2026-06/a.jpg"'), 'post file has images');

  const noTitle = await api('POST', '/api/items', {
    type: 'post', title: '', time: '2026-06-01 08:30:00', tags: [], draft: false, body: 'x',
  });
  assert(noTitle.status === 500 && /title/i.test(noTitle.data.error), 'create post without title -> validation error');

  const badTime = await api('POST', '/api/items', {
    type: 'post', title: 'X', time: 'not-a-time', tags: [], draft: false, body: 'x',
  });
  assert(badTime.status === 500 && /time/i.test(badTime.data.error), 'create post with bad time -> validation error');

  const thought = await api('POST', '/api/items', {
    type: 'thought',
    time: '2026-06-02 09:00:00',
    tags: ['random'],
    draft: true,
    color: 'gradient-red-purple',
    body: 'A new thought.',
  });
  assert(thought.status === 201, 'create thought -> 201');
  newThoughtSlug = thought.data.item.slug;
  assert(thought.data.item.draft === true, 'thought is draft');
  assert(thought.data.item.color === 'gradient-red-purple', 'thought has color');

  const badColor = await api('POST', '/api/items', {
    type: 'thought', time: '2026-06-02 09:00:00', tags: [], draft: false, color: 'solid-notacolor', body: 'x',
  });
  assert(badColor.status === 500 && /color/i.test(badColor.data.error), 'create thought with bad color -> validation error');

  const code = await api('POST', '/api/items', {
    type: 'code',
    title: 'My Snippet',
    time: '2026-06-03 10:00:00',
    language: 'javascript',
    tags: ['js'],
    draft: false,
    body: 'console.log(1);',
  });
  assert(code.status === 201, 'create code -> 201');
  newCodeSlug = code.data.item.slug;

  const badLang = await api('POST', '/api/items', {
    type: 'code', title: 'X', time: '2026-06-03 10:00:00', language: 'cobol', tags: [], draft: false, body: 'x',
  });
  assert(badLang.status === 500 && /language/i.test(badLang.data.error), 'create code with bad language -> validation error');

  // Drafts are visible to the admin (unlike the build)
  const drafts = await api('GET', '/api/items?draft=true');
  assert(drafts.data.total === 1 && drafts.data.items[0].slug === newThoughtSlug, 'drafts visible in admin list');
}

// ============================================================
console.log('\n[4] Get item + preview');
// ============================================================

{
  const item = await api('GET', `/api/items/post/${newPostSlug}`);
  assert(item.status === 200, 'get item -> 200');
  assert(item.data.item.html.includes('<strong>world</strong>'), 'item html rendered (bold)');
  assert(item.data.item.body.includes('Hello **world**'), 'item body is raw markdown');

  const missing = await api('GET', '/api/items/post/nonexistent');
  assert(missing.status === 404, 'get missing item -> 404');

  const preview = await api('POST', '/api/preview', {
    type: 'post',
    body: '## Heading\n\nSome *text* and `code`.\n\n```js\nconst x = 1;\n```',
  });
  assert(preview.status === 200, 'preview -> 200');
  assert(preview.data.html.includes('<h2>Heading</h2>'), 'preview renders heading');
  assert(preview.data.html.includes('<em>text</em>'), 'preview renders italic');
  assert(preview.data.html.includes('language-js'), 'preview highlights code');

  const codePreview = await api('POST', '/api/preview', { type: 'code', body: 'print("x")', language: 'python' });
  assert(codePreview.status === 200 && codePreview.data.html.includes('language-python'), 'code preview highlights python');
}

// ============================================================
console.log('\n[5] Update item');
// ============================================================

{
  const before = readFileSync(join(TEST_DIR, 'content/posts', `${newPostSlug}.md`), 'utf8');
  const updated = await api('PUT', `/api/items/post/${newPostSlug}`, {
    title: 'Updated Title',
    tags: ['updated'],
  });
  assert(updated.status === 200, 'update item -> 200');
  assert(updated.data.item.title === 'Updated Title', 'title updated');
  assert(updated.data.item.tags.length === 1 && updated.data.item.tags[0] === 'updated', 'tags replaced');
  assert(updated.data.item.time === '2026-06-01 08:30:00', 'time preserved on partial update');
  assert(updated.data.item.body.includes('Hello **world**'), 'body preserved on partial update');

  const after = readFileSync(join(TEST_DIR, 'content/posts', `${newPostSlug}.md`), 'utf8');
  assert(after.includes('title: "Updated Title"'), 'file on disk has new title');
  assert(after.includes('time: 2026-06-01 08:30:00'), 'file on disk keeps time');

  // Backup was created
  const backupDir = join(TEST_DIR, '.jawi-admin/backups');
  assert(existsSync(backupDir), 'backup dir exists');
  const { readdirSync } = await import('fs');
  const backups = readdirSync(backupDir).filter(f => f.startsWith(`${newPostSlug}.md.`));
  assert(backups.length >= 1, 'backup of previous version created');
  const backupContent = readFileSync(join(backupDir, backups[0]), 'utf8');
  assert(backupContent.includes('My New Post'), 'backup contains previous title');
  void before;
}

// ============================================================
console.log('\n[6] Toggle draft + duplicate');
// ============================================================

{
  const t1 = await api('POST', `/api/items/thought/${newThoughtSlug}/toggle-draft`);
  assert(t1.status === 200 && t1.data.item.draft === false, 'toggle draft: true -> false');
  const t2 = await api('POST', `/api/items/thought/${newThoughtSlug}/toggle-draft`);
  assert(t2.data.item.draft === true, 'toggle draft: false -> true');

  const dup = await api('POST', `/api/items/post/${newPostSlug}/duplicate`);
  assert(dup.status === 201, 'duplicate -> 201');
  assert(dup.data.item.slug !== newPostSlug, 'duplicate has new slug');
  assert(dup.data.item.draft === true, 'duplicate starts as draft');
  assert(dup.data.item.title === 'Updated Title (copy)', 'duplicate title suffixed');
  assert(dup.data.item.body.includes('Hello **world**'), 'duplicate has same body');
}

// ============================================================
console.log('\n[7] Trash: delete, restore, purge');
// ============================================================

{
  const del = await api('DELETE', `/api/items/thought/${newThoughtSlug}`);
  assert(del.status === 200 && del.data.trashId, 'delete -> trashId');
  assert(!existsSync(join(TEST_DIR, 'content/thoughts', `${newThoughtSlug}.md`)), 'file removed from content dir');

  const list = await api('GET', '/api/items?type=thought');
  assert(list.data.total === 1 && list.data.items[0].slug === 'seed-thought', 'deleted item no longer listed');

  const trash = await api('GET', '/api/trash');
  assert(trash.status === 200 && trash.data.entries.length >= 1, 'trash lists entry');
  const entry = trash.data.entries.find(e => e.slug === newThoughtSlug);
  assert(!!entry, 'trash entry found');

  const restore = await api('POST', `/api/trash/${entry.trashId}/restore`);
  assert(restore.status === 200, 'restore -> 200');
  assert(existsSync(join(TEST_DIR, 'content/thoughts', `${newThoughtSlug}.md`)), 'file restored to content dir');
  const restored = await api('GET', `/api/items/thought/${newThoughtSlug}`);
  assert(restored.status === 200 && restored.data.item.color === 'gradient-red-purple', 'restored item intact');

  // Purge
  const del2 = await api('DELETE', `/api/items/thought/${newThoughtSlug}`);
  const trash2 = await api('GET', '/api/trash');
  const entry2 = trash2.data.entries.find(e => e.slug === newThoughtSlug);
  const purge = await api('DELETE', `/api/trash/${entry2.trashId}`);
  assert(purge.status === 200, 'purge -> 200');
  const trash3 = await api('GET', '/api/trash');
  assert(!trash3.data.entries.some(e => e.slug === newThoughtSlug), 'purged entry gone from trash');
  void del2;
}

// ============================================================
console.log('\n[8] Tags: rename + remove');
// ============================================================

{
  const tags = await api('GET', '/api/tags');
  assert(tags.status === 200, 'GET /api/tags -> 200');
  assert(tags.data.tags.includes('coding'), 'tags include "coding"');

  const rename = await api('POST', '/api/tags/rename', { from: 'coding', to: 'development' });
  assert(rename.status === 200 && rename.data.updated >= 1, 'rename tag -> updated files');

  const tags2 = await api('GET', '/api/tags');
  assert(!tags2.data.tags.includes('coding') && tags2.data.tags.includes('development'), 'tag renamed in listing');

  // The "coding" tag lives on the seed post (the new post's tags were replaced in [5])
  const seedPostFile = readFileSync(join(TEST_DIR, 'content/posts/seed-post.md'), 'utf8');
  assert(seedPostFile.includes('- "development"') && !seedPostFile.includes('- "coding"'), 'file on disk has renamed tag');

  const remove = await api('DELETE', '/api/tags/development');
  assert(remove.status === 200 && remove.data.updated >= 1, 'remove tag -> updated files');
  const seedPostFile2 = readFileSync(join(TEST_DIR, 'content/posts/seed-post.md'), 'utf8');
  assert(!seedPostFile2.includes('development'), 'file on disk no longer has tag');

  const noItems = await api('POST', '/api/tags/rename', { from: 'doesnotexist', to: 'x' });
  assert(noItems.status === 500, 'rename nonexistent tag -> error');
}

// ============================================================
console.log('\n[9] Images: upload, list, preview, delete');
// ============================================================

{
  // 1x1 red PNG
  const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const up = await api('POST', '/api/images', { filename: 'test.png', dataBase64: pngBase64 });
  assert(up.status === 201, 'upload image -> 201');
  assert(up.data.path.startsWith('images/'), 'upload path under images/');
  assert(existsSync(join(TEST_DIR, 'public', up.data.path)), 'uploaded file exists on disk');

  const up2 = await api('POST', '/api/images', { filename: 'test.png', dataBase64: pngBase64 });
  assert(up2.status === 201 && up2.data.path !== up.data.path, 'duplicate upload gets unique name');

  const badExt = await api('POST', '/api/images', { filename: 'evil.exe', dataBase64: pngBase64 });
  assert(badExt.status === 500 && /type/i.test(badExt.data.error), 'upload with bad extension -> error');

  const traversal = await api('POST', '/api/images', { filename: '../../evil.png', dataBase64: pngBase64 });
  assert(traversal.status === 500, 'upload with traversal filename -> error');

  const list = await api('GET', '/api/images');
  assert(list.status === 200 && list.data.total >= 2, 'image list includes uploads');

  const preview = await fetch(`${BASE}/api/images/preview?path=${encodeURIComponent(up.data.path)}`, { headers: { Cookie: cookie } });
  assert(preview.status === 200 && preview.headers.get('content-type') === 'image/png', 'image preview serves PNG');

  const previewTraversal = await fetch(`${BASE}/api/images/preview?path=../../etc/passwd`, { headers: { Cookie: cookie } });
  assert(previewTraversal.status === 404 || previewTraversal.status === 400, 'image preview traversal blocked');

  const del = await api('DELETE', '/api/images', { path: up.data.path });
  assert(del.status === 200, 'delete image -> 200');
  assert(!existsSync(join(TEST_DIR, 'public', up.data.path)), 'deleted image gone from disk');
}

// ============================================================
console.log('\n[10] Config: read + write + validate');
// ============================================================

{
  const cfg = await api('GET', '/api/config');
  assert(cfg.status === 200, 'GET /api/config -> 200');
  assert(cfg.data.config.site.title === 'Test Blog', 'config title matches');
  assert(cfg.data.fileExists === true, 'config file exists');

  const put = await api('PUT', '/api/config', {
    site: { title: 'New Title', footer: 'New Footer', url: 'https://example.com', watermark: { text: 'hi', style: 'right' } },
    content: { postsPerPage: 5, thoughtsPerPage: 12, tagsPerPage: 20 },
    display: { timezone: 'Asia/Kuala_Lumpur', dateFormat: 'medium' },
  });
  assert(put.status === 200, 'PUT /api/config -> 200');
  const raw = readFileSync(join(TEST_DIR, 'jawi.config.mjs'), 'utf8');
  assert(raw.includes('"New Title"'), 'config file has new title');
  assert(raw.includes('postsPerPage: 5'), 'config file has new postsPerPage');
  assert(raw.includes('Asia/Kuala_Lumpur'), 'config file has new timezone');
  assert(raw.includes('style: "right"'), 'config file has watermark style');

  const badTz = await api('PUT', '/api/config', { display: { timezone: 'Not/AZone' } });
  assert(badTz.status === 500 && /timezone/i.test(badTz.data.error), 'invalid timezone rejected');

  const badFmt = await api('PUT', '/api/config', { display: { dateFormat: 'fancy' } });
  assert(badFmt.status === 500 && /dateFormat/i.test(badFmt.data.error), 'invalid date format rejected');

  const badWm = await api('PUT', '/api/config', { site: { watermark: { text: 'x', style: 'spiral' } } });
  assert(badWm.status === 500 && /watermark/i.test(badWm.data.error), 'invalid watermark style rejected');

  const badCount = await api('PUT', '/api/config', { content: { postsPerPage: 0 } });
  assert(badCount.status === 500, 'postsPerPage=0 rejected');
}

// ============================================================
console.log('\n[11] Audit log');
// ============================================================

{
  const audit = await api('GET', '/api/audit?limit=500');
  assert(audit.status === 200, 'GET /api/audit -> 200');
  const actions = audit.data.entries.map(e => e.action);
  assert(actions.includes('create'), 'audit has create entries');
  assert(actions.includes('update'), 'audit has update entries');
  assert(actions.includes('trash'), 'audit has trash entries');
  assert(actions.includes('restore'), 'audit has restore entries');
  assert(actions.includes('tag-rename'), 'audit has tag-rename entries');
  assert(actions.includes('image-upload'), 'audit has image-upload entries');
  assert(actions.includes('config-update'), 'audit has config-update entries');
  const newestFirst = audit.data.entries[0].ts >= audit.data.entries[audit.data.entries.length - 1].ts;
  assert(newestFirst, 'audit entries newest-first');
}

// ============================================================
console.log('\n[12] Security');
// ============================================================

{
  // CSRF: mutating request from a different origin must be rejected
  const csrf = await api('POST', '/api/items', {
    type: 'thought', time: '2026-06-05 00:00:00', tags: [], draft: false, body: 'x',
  }, { headers: { Origin: 'https://evil.example' } });
  assert(csrf.status === 403, 'mutating request with foreign Origin -> 403');

  // Same-origin allowed
  const sameOrigin = await api('POST', '/api/preview', { type: 'post', body: 'x' },
    { headers: { Origin: BASE } });
  assert(sameOrigin.status === 200, 'same-origin request allowed');

  // Static path traversal
  const trav = await fetch(`${BASE}/..%2f..%2fpackage.json`);
  assert(trav.status === 400 || trav.status === 404 || trav.status === 403, 'static traversal blocked');

  // Unknown API endpoint
  const unknown = await api('GET', '/api/nope');
  assert(unknown.status === 404, 'unknown API endpoint -> 404');

  // Logout
  const out = await api('POST', '/api/logout');
  assert(out.status === 200, 'logout -> 200');
  const after = await api('GET', '/api/items');
  assert(after.status === 401, 'after logout, API requires auth again');

  // Re-login for remaining checks
  const re = await api('POST', '/api/login', { token: TOKEN });
  cookie = (re.headers.get('set-cookie') || '').split(';')[0];
}

// ============================================================
console.log('\n[13] SPA served');
// ============================================================

{
  const index = await fetch(`${BASE}/`);
  assert(index.status === 200 && (index.headers.get('content-type') || '').includes('text/html'), 'GET / serves SPA html');
  const body = await index.text();
  assert(body.includes('Jawi Admin'), 'SPA html contains title');

  const appJs = await fetch(`${BASE}/app.js`);
  assert(appJs.status === 200 && (appJs.headers.get('content-type') || '').includes('javascript'), 'app.js served');

  const css = await fetch(`${BASE}/style.css`);
  assert(css.status === 200 && (css.headers.get('content-type') || '').includes('text/css'), 'style.css served');

  const spaFallback = await fetch(`${BASE}/items/post/abc`);
  assert(spaFallback.status === 200 && (spaFallback.headers.get('content-type') || '').includes('text/html'), 'SPA fallback for client routes');
}

// ============================================================
console.log('\n[14] MDX code round-trip');
// ============================================================

{
  const mdx = await api('POST', '/api/items', {
    type: 'code',
    title: 'MDX Snippet',
    time: '2026-06-06 00:00:00',
    language: 'astro',
    tags: ['astro'],
    draft: false,
    mdx: true,
    body: 'const x = 1;\nconsole.log(x);',
  });
  assert(mdx.status === 201, 'create mdx code -> 201');
  const slug = mdx.data.item.slug;
  const file = join(TEST_DIR, 'content/codes', `${slug}.mdx`);
  assert(existsSync(file), 'mdx file exists');
  const content = readFileSync(file, 'utf8');
  assert(content.includes('language: astro'), 'mdx file has language');
  assert(content.includes('const x = 1;'), 'mdx file has body');

  const updated = await api('PUT', `/api/items/code/${slug}`, { body: 'const y = 2;\nconsole.log(y);' });
  assert(updated.status === 200, 'update mdx code -> 200');
  const content2 = readFileSync(file, 'utf8');
  assert(content2.includes('const y = 2;') && !content2.includes('const x = 1;'), 'mdx body updated');
  assert(content2.includes('language: astro'), 'mdx frontmatter preserved');
}

// ---------- Teardown ----------

server.close();
cleanup();

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${'='.repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
