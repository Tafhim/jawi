/**
 * Start the Jawi admin panel (local web UI for managing content).
 * @usage jawi admin [options]
 *
 * Options:
 *   --port <n>        Port to listen on (default: 4322)
 *   --host <host>     Interface to bind (default: 127.0.0.1)
 *   --token <token>   Admin token (overrides JAWI_ADMIN_TOKEN and stored token)
 *   --open            Open the admin panel in your browser
 *
 * Examples:
 *   jawi admin
 *   jawi admin --port 5000
 *   JAWI_ADMIN_TOKEN=secret jawi admin
 */

import { spawn } from 'child_process';
import { startAdminServer } from '../admin/index.js';

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg === '-p') {
      options.port = Number(args[++i]);
    } else if (arg.startsWith('--port=')) {
      options.port = Number(arg.split('=')[1]);
    } else if (arg === '--host') {
      options.host = args[++i];
    } else if (arg.startsWith('--host=')) {
      options.host = arg.split('=')[1];
    } else if (arg === '--token') {
      options.token = args[++i];
    } else if (arg.startsWith('--token=')) {
      options.token = arg.split('=')[1];
    } else if (arg === '--open') {
      options.open = true;
    }
  }
  return options;
}

function openBrowser(url) {
  const platform = process.platform;
  const command = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  const args = platform === 'win32' ? ['', url] : [url];
  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => {
      console.log(`  Could not open browser automatically. Visit ${url} manually.`);
    });
    child.unref();
  } catch {
    console.log(`  Could not open browser automatically. Visit ${url} manually.`);
  }
}

export async function admin(args) {
  const options = parseArgs(Array.isArray(args) ? args : []);

  if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) {
    console.error(`\n❌ Invalid port: ${options.port}`);
    process.exit(1);
  }

  if (options.host && options.host !== '127.0.0.1' && options.host !== 'localhost' && !process.env.JAWI_ADMIN_TOKEN && !options.token) {
    console.warn('\n⚠️  Binding to a non-local interface without an explicit token.');
    console.warn('   The generated token will be used, but consider setting JAWI_ADMIN_TOKEN.\n');
  }

  const { url } = await startAdminServer({
    port: options.port,
    host: options.host,
    token: options.token,
  });

  if (options.open) {
    // Small delay so the browser doesn't race the server
    setTimeout(() => openBrowser(url), 300);
  }

  // Keep the process alive; shut down cleanly on Ctrl+C
  const shutdown = () => {
    console.log('\n\nShutting down the admin panel...');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
