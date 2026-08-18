/**
 * Authentication for the Jawi admin panel.
 *
 * Model:
 *   - A single admin token. Source priority:
 *       1. JAWI_ADMIN_TOKEN environment variable
 *       2. --token CLI flag
 *       3. A generated token persisted to <root>/.jawi-admin/token (chmod 600)
 *   - Login exchanges the token for a session cookie (HttpOnly, SameSite=Strict).
 *   - Sessions live in memory with a 12-hour expiry.
 *
 * The server binds to 127.0.0.1 by default, so the token is the second layer
 * of defense for anyone who explicitly exposes the port.
 */

import { randomBytes, timingSafeEqual } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const COOKIE_NAME = 'jawi_admin_session';

/**
 * Constant-time string comparison.
 */
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // Compare against self to keep timing uniform, then fail.
    timingSafeEqual(ba, ba);
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/**
 * Create an auth manager bound to a project root.
 * @param {string} root - Project root directory
 * @param {string} [envToken] - Token from JAWI_ADMIN_TOKEN (highest priority)
 * @param {string} [flagToken] - Token from --token CLI flag
 */
export function createAuthManager(root, envToken, flagToken) {
  const tokenPath = join(root, '.jawi-admin', 'token');
  const sessions = new Map(); // sessionId -> { expiresAt }

  /**
   * Resolve the admin token. Generates + persists one if none was provided.
   * @returns {Promise<{token: string, source: string}>}
   */
  async function resolveToken() {
    if (envToken) return { token: envToken, source: 'env' };
    if (flagToken) return { token: flagToken, source: 'flag' };
    try {
      const existing = (await readFile(tokenPath, 'utf8')).trim();
      if (existing.length >= 16) return { token: existing, source: 'file' };
    } catch {
      // No stored token yet - generate one below.
    }
    const token = randomBytes(24).toString('hex');
    try {
      await mkdir(join(root, '.jawi-admin'), { recursive: true });
      await writeFile(tokenPath, token + '\n', { mode: 0o600 });
    } catch {
      // If we cannot persist, the token still works for this process lifetime.
    }
    return { token, source: 'generated' };
  }

  /**
   * Verify a candidate token against the resolved token.
   * @param {string} candidate
   * @param {string} resolvedToken
   * @returns {boolean}
   */
  function verifyToken(candidate, resolvedToken) {
    if (!candidate || candidate.length < 8) return false;
    return safeEqual(candidate, resolvedToken);
  }

  /**
   * Create a new session. Returns the session id (cookie value).
   */
  function createSession() {
    const id = randomBytes(32).toString('hex');
    sessions.set(id, { expiresAt: Date.now() + SESSION_TTL_MS });
    return id;
  }

  /**
   * Check whether a session id is valid and not expired.
   */
  function isValidSession(id) {
    if (!id) return false;
    const s = sessions.get(id);
    if (!s) return false;
    if (Date.now() > s.expiresAt) {
      sessions.delete(id);
      return false;
    }
    return true;
  }

  /**
   * Destroy a session.
   */
  function destroySession(id) {
    if (id) sessions.delete(id);
  }

  /**
   * Parse the session cookie from a request header value.
   * @param {string} cookieHeader
   * @returns {string|null}
   */
  function sessionIdFromCookie(cookieHeader) {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const name = part.slice(0, idx).trim();
      if (name === COOKIE_NAME) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return null;
  }

  return {
    COOKIE_NAME,
    resolveToken,
    verifyToken,
    createSession,
    isValidSession,
    destroySession,
    sessionIdFromCookie,
  };
}
