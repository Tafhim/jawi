/**
 * Central config system for @jawi/core.
 *
 * Replaces all import.meta.env reads with a config object loaded from
 * jawi.config.mjs in the user's project root. Default values match
 * the current .env.example defaults.
 */

import { pathToFileURL } from 'url';

/**
 * Default configuration values.
 */
export const defaultConfig = {
  site: {
    title: 'Jawi',
    footer: 'Jawi',
    url: '',
  },
  content: {
    dir: './content',
    postsPerPage: 9,
    tagsPerPage: 50,
  },
  display: {
    timezone: 'UTC',
    dateFormat: 'long',
  },
};

/**
 * Valid date format presets.
 */
const VALID_DATE_FORMATS = ['long', 'medium', 'short', 'compact', 'minimal', 'iso'];

/**
 * Validate an IANA timezone string.
 * Uses Intl.DateTimeFormat which throws on unsupported timezones.
 * @param {string} tz - IANA timezone (e.g. "Asia/Kolkata", "America/New_York") or "USER"
 * @returns {boolean}
 */
export function validateTimezone(tz) {
  if (!tz || tz.trim() === '') {
    return false;
  }
  const trimmed = tz.trim();
  // 'USER' is a special value - skip IANA validation
  if (trimmed.toUpperCase() === 'USER') {
    return true;
  }
  try {
    new Intl.DateTimeFormat('en', { timeZone: trimmed, hour: 'numeric' }).format(new Date());
    return true;
  } catch {
    if (typeof process !== 'undefined' && process.stdout) {
      console.warn(`Warning: Invalid timezone "${trimmed}". Falling back to UTC.`);
    }
    return false;
  }
}

/**
 * Validate a date format preset.
 * @param {string} fmt - Date format preset
 * @returns {boolean}
 */
export function validateDateFormat(fmt) {
  if (!fmt || typeof fmt !== 'string') {
    return false;
  }
  return VALID_DATE_FORMATS.includes(fmt.toLowerCase());
}

/**
 * Deep merge user config with defaults.
 * @param {Object} defaults
 * @param {Object} userConfig
 * @returns {Object}
 */
function mergeConfig(defaults, userConfig) {
  const result = { ...defaults };
  for (const key of Object.keys(userConfig)) {
    if (
      userConfig[key] &&
      typeof userConfig[key] === 'object' &&
      !Array.isArray(userConfig[key]) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = mergeConfig(result[key], userConfig[key]);
    } else {
      result[key] = userConfig[key];
    }
  }
  return result;
}

/**
 * Load configuration from jawi.config.mjs in the user's project root.
 * If the file doesn't exist, returns defaultConfig.
 *
 * @param {string} projectRoot - Path to the user's project root directory
 * @returns {Promise<Object>} Resolved config object
 */
/**
 * Validate a complete config object.
 * Throws descriptive errors on validation failure.
 * @param {Object} config - Config object to validate
 * @throws {Error} If validation fails
 */
export function validateConfig(config) {
  if (!config) {
    throw new Error('Config object is required');
  }

  // Validate timezone
  if (config.display && config.display.timezone) {
    if (!validateTimezone(config.display.timezone)) {
      throw new Error(
        `Invalid timezone "${config.display.timezone}". ` +
        'Must be "USER" or a valid IANA timezone (e.g., "Asia/Kolkata", "America/New_York").'
      );
    }
  }

  // Validate date format
  if (config.display && config.display.dateFormat) {
    if (!validateDateFormat(config.display.dateFormat)) {
      throw new Error(
        `Invalid date format "${config.display.dateFormat}". ` +
        `Must be one of: ${VALID_DATE_FORMATS.join(', ')}`
      );
    }
  }
}

export async function loadConfig(projectRoot) {
  let userConfig = {};

  try {
    // Try to import jawi.config.mjs from the project root
    const configPath = pathToFileURL(`${projectRoot}/jawi.config.mjs`).href;
    const configModule = await import(configPath);
    userConfig = configModule.default || {};
  } catch {
    // File not found or import failed - try process.cwd() as fallback
    // This handles the case where pages are served from a linked package
    // and projectRoot points to the framework directory, not the site root
    try {
      const fallbackPath = pathToFileURL(`${process.cwd()}/jawi.config.mjs`).href;
      const fallbackModule = await import(fallbackPath);
      userConfig = fallbackModule.default || {};
    } catch {
      // Both attempts failed - use defaults
      // This is expected for projects that haven't created jawi.config.mjs yet
    }
  }

  // Merge user config with defaults
  const config = mergeConfig(defaultConfig, userConfig);

  // Normalize timezone
  if (config.display.timezone) {
    const tz = config.display.timezone.trim();
    if (tz.toUpperCase() === 'USER') {
      config.display.timezone = 'USER';
    } else if (!validateTimezone(tz)) {
      if (typeof process !== 'undefined' && process.stdout) {
        console.warn(`Warning: Invalid timezone "${tz}" in config. Falling back to UTC.`);
      }
      config.display.timezone = 'UTC';
    }
  }

  // Validate date format
  if (!validateDateFormat(config.display.dateFormat)) {
    if (typeof process !== 'undefined' && process.stdout) {
      console.warn(
        `Warning: Invalid date format "${config.display.dateFormat}" in config. ` +
        `Falling back to "long". Valid formats: ${VALID_DATE_FORMATS.join(', ')}`
      );
    }
    config.display.dateFormat = 'long';
  }

  return config;
}
