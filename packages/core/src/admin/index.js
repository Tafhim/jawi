/**
 * Jawi Admin Panel - entry point.
 *
 * Starts a local web admin panel for a Jawi site:
 *
 *   import { startAdminServer } from '@jawi/core/admin';
 *   const server = await startAdminServer({ port: 4322 });
 *
 * Or from the CLI:  npx jawi admin
 *
 * @module @jawi/core/admin
 */

import { resolve } from 'path';
import { loadConfig } from '../config.js';
import { createAuditLogger } from './audit.js';
import { createAuthManager } from './auth.js';
import { createContentStore } from './store.js';
import { createImageStore } from './images.js';
import { createConfigStore } from './config-store.js';
import { createTagManager } from './tags.js';
import { createPreviewRenderer } from './preview.js';
import { createAdminServer } from './server.js';
import { getVersion } from '../version.js';

/**
 * Start the Jawi admin panel server.
 *
 * @param {Object} [options]
 * @param {string} [options.root=process.cwd()] - Project root (where jawi.config.mjs lives)
 * @param {number} [options.port=4322] - Port to listen on
 * @param {string} [options.host='127.0.0.1'] - Interface to bind
 * @param {string} [options.token] - Admin token (overrides JAWI_ADMIN_TOKEN and stored token)
 * @param {boolean} [options.quiet=false] - Suppress the startup banner
 * @returns {Promise<{server: import('http').Server, url: string, token: string, port: number}>}
 */
export async function startAdminServer(options = {}) {
  const root = resolve(options.root || process.cwd());
  const host = options.host || '127.0.0.1';
  // Use ?? (not ||) so that port: 0 ("pick a random free port") is respected.
  const requestedPort = options.port ?? 4322;

  // Load site config (content dir, etc.)
  const config = await loadConfig(root);
  const contentDir = resolve(root, config.content.dir || './content');

  // Wire up subsystems
  const audit = createAuditLogger(root);
  const auth = createAuthManager(root, process.env.JAWI_ADMIN_TOKEN, options.token);
  const { token } = await auth.resolveToken();
  const store = createContentStore({ root, contentDir, audit });
  const images = createImageStore({ root, audit });
  const configStore = createConfigStore({ root, audit });
  const tags = createTagManager({ store, audit });
  const preview = createPreviewRenderer({ contentDir });

  const ctx = {
    root,
    contentDir,
    config,
    token,
    auth,
    store,
    images,
    configStore,
    tags,
    preview,
    audit,
  };

  const server = createAdminServer(ctx);

  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(requestedPort, host, () => resolveListen());
  });

  const port = server.address().port;
  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;

  if (!options.quiet) {
    const siteTitle = config.site.title || 'Jawi';
    console.log('');
    console.log(`  ┌──────────────────────────────────────────────────────┐`);
    console.log(`  │  Jawi Admin Panel  ·  @jawi/core v${getVersion()}          │`);
    console.log(`  └──────────────────────────────────────────────────────┘`);
    console.log('');
    console.log(`  Site:     ${siteTitle}`);
    console.log(`  Content:  ${contentDir}`);
    console.log(`  URL:      ${url}`);
    console.log('');
    console.log(`  Open the URL in your browser, then enter this token:`);
    console.log('');
    console.log(`    ${token}`);
    console.log('');
    console.log(`  (Token source: ${process.env.JAWI_ADMIN_TOKEN ? 'JAWI_ADMIN_TOKEN env var' : options.token ? '--token flag' : '.jawi-admin/token'} — stored in .jawi-admin/token)`);
    console.log('');
    console.log(`  Press Ctrl+C to stop.`);
    console.log('');
  }

  return { server, url, token, port };
}
