/**
 * Append-only JSONL audit log for the Jawi admin panel.
 *
 * Every mutating operation (create, update, delete, restore, config change,
 * tag rename, image upload/delete) appends one JSON line to
 * <root>/.jawi-admin/audit.log.
 */

import { appendFile, mkdir, readFile } from 'fs/promises';
import { join } from 'path';

/**
 * Create an audit logger bound to a project root.
 * @param {string} root - Project root directory
 */
export function createAuditLogger(root) {
  const dir = join(root, '.jawi-admin');
  const logPath = join(dir, 'audit.log');

  /**
   * Record an audit entry.
   * @param {string} action - e.g. "create", "update", "delete"
   * @param {Object} [detail] - Arbitrary JSON-serializable detail
   */
  async function record(action, detail = {}) {
    const entry = {
      ts: new Date().toISOString(),
      action,
      ...detail,
    };
    try {
      await mkdir(dir, { recursive: true });
      await appendFile(logPath, JSON.stringify(entry) + '\n', 'utf8');
    } catch {
      // Audit failures must never break the operation itself.
    }
  }

  /**
   * Read recent audit entries (newest first).
   * @param {number} [limit=100]
   * @returns {Promise<Array>}
   */
  async function recent(limit = 100) {
    try {
      const raw = await readFile(logPath, 'utf8');
      const lines = raw.split('\n').filter(l => l.trim().length > 0);
      const entries = [];
      for (const line of lines) {
        try {
          entries.push(JSON.parse(line));
        } catch {
          // Skip malformed lines
        }
      }
      return entries.slice(-limit).reverse();
    } catch {
      return [];
    }
  }

  return { record, recent, logPath };
}
