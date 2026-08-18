/**
 * Configuration store for the Jawi admin panel.
 *
 * Reads the effective config (defaults merged with jawi.config.mjs) and
 * writes validated changes back to jawi.config.mjs. The file is rewritten
 * in full with a stable, readable format.
 */

import { copyFile, mkdir, readFile, stat, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { loadConfig, defaultConfig, validateConfig } from '../config.js';
import { utcNow } from '../utils/timezone.js';

export const DATE_FORMAT_PRESETS = ['long', 'medium', 'short', 'compact', 'minimal', 'iso'];
export const WATERMARK_STYLES = ['diagonal', 'right'];

/**
 * Serialize a config object to the canonical jawi.config.mjs format.
 * @param {Object} config
 * @returns {string}
 */
export function serializeConfig(config) {
  const lines = [];
  lines.push('/** @type {import(\'@jawi/core/config\').JawiConfig} */');
  lines.push('export default {');
  lines.push('  site: {');
  lines.push(`    title: ${JSON.stringify(config.site.title || '')},`);
  lines.push(`    footer: ${JSON.stringify(config.site.footer || '')},`);
  lines.push(`    url: ${JSON.stringify(config.site.url || '')},`);
  lines.push('    watermark: {');
  lines.push(`      text: ${JSON.stringify(config.site.watermark?.text || '')},`);
  lines.push(`      style: ${JSON.stringify(config.site.watermark?.style || 'diagonal')},`);
  lines.push('    },');
  lines.push('  },');
  lines.push('  content: {');
  lines.push(`    dir: ${JSON.stringify(config.content.dir || './content')},`);
  lines.push(`    postsPerPage: ${Number(config.content.postsPerPage) || 9},`);
  lines.push(`    thoughtsPerPage: ${Number(config.content.thoughtsPerPage) || 9},`);
  lines.push(`    tagsPerPage: ${Number(config.content.tagsPerPage) || 50},`);
  lines.push('  },');
  lines.push('  display: {');
  lines.push(`    timezone: ${JSON.stringify(config.display.timezone || 'UTC')},`);
  lines.push(`    dateFormat: ${JSON.stringify(config.display.dateFormat || 'long')},`);
  lines.push('  },');
  lines.push('};');
  lines.push('');
  return lines.join('\n');
}

/**
 * Validate a user-submitted config patch. Returns { config, errors }.
 * @param {Object} current - Current effective config
 * @param {Object} patch - Partial config from the UI
 */
export function validateConfigPatch(current, patch) {
  const errors = [];
  const config = JSON.parse(JSON.stringify(current));

  if (patch.site) {
    if (patch.site.title !== undefined) config.site.title = String(patch.site.title);
    if (patch.site.footer !== undefined) config.site.footer = String(patch.site.footer);
    if (patch.site.url !== undefined) config.site.url = String(patch.site.url);
    if (patch.site.watermark) {
      config.site.watermark = {
        text: patch.site.watermark.text !== undefined ? String(patch.site.watermark.text) : (config.site.watermark?.text || ''),
        style: patch.site.watermark.style !== undefined ? String(patch.site.watermark.style) : (config.site.watermark?.style || 'diagonal'),
      };
      if (!WATERMARK_STYLES.includes(config.site.watermark.style)) {
        errors.push(`Watermark style must be one of: ${WATERMARK_STYLES.join(', ')}`);
      }
    }
  }

  if (patch.content) {
    if (patch.content.dir !== undefined) config.content.dir = String(patch.content.dir);
    for (const key of ['postsPerPage', 'thoughtsPerPage', 'tagsPerPage']) {
      if (patch.content[key] !== undefined) {
        const n = Number(patch.content[key]);
        if (!Number.isInteger(n) || n < 1 || n > 1000) {
          errors.push(`${key} must be an integer between 1 and 1000.`);
        } else {
          config.content[key] = n;
        }
      }
    }
  }

  if (patch.display) {
    if (patch.display.timezone !== undefined) config.display.timezone = String(patch.display.timezone);
    if (patch.display.dateFormat !== undefined) config.display.dateFormat = String(patch.display.dateFormat);
    if (!DATE_FORMAT_PRESETS.includes(config.display.dateFormat)) {
      errors.push(`dateFormat must be one of: ${DATE_FORMAT_PRESETS.join(', ')}`);
    }
  }

  if (errors.length === 0) {
    try {
      validateConfig(config);
    } catch (e) {
      errors.push(e.message);
    }
  }

  return { config, errors };
}

/**
 * Create a config store bound to a project.
 * @param {Object} opts
 * @param {string} opts.root - Project root
 * @param {Object} opts.audit - Audit logger
 */
export function createConfigStore({ root, audit }) {
  const configPath = join(root, 'jawi.config.mjs');

  /**
   * Read the effective config plus file metadata.
   */
  async function readConfig() {
    const config = await loadConfig(root);
    let fileExists = false;
    let raw = null;
    try {
      await stat(configPath);
      fileExists = true;
      raw = await readFile(configPath, 'utf8');
    } catch {
      // No config file yet - effective config is the defaults.
    }
    return { config, fileExists, raw, configPath };
  }

  /**
   * Write a validated config patch to jawi.config.mjs.
   * @param {Object} patch - Partial config
   * @returns {Promise<{config: Object, backup: string|null}>}
   */
  async function writeConfig(patch) {
    const { config: current } = await readConfig();
    const { config, errors } = validateConfigPatch(current, patch);
    if (errors.length) throw new Error(errors.join(' '));

    // Backup existing file
    let backupPath = null;
    try {
      await stat(configPath);
      const stamp = utcNow().replace(/[: ]/g, '-');
      backupPath = join(root, '.jawi-admin', 'backups', `jawi.config.mjs.${stamp}.bak`);
      await mkdir(dirname(backupPath), { recursive: true });
      await copyFile(configPath, backupPath);
    } catch {
      // No existing file to back up
    }

    await writeFile(configPath, serializeConfig(config), 'utf8');
    await audit?.record('config-update', {
      changed: Object.keys(patch || {}),
      backup: backupPath,
    });
    return { config, backup: backupPath };
  }

  return { readConfig, writeConfig, configPath };
}
