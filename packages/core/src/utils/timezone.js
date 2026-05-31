/**
 * Timezone utility for the microblog.
 *
 * All content stores `time` in UTC as "YYYY-MM-DD HH:MM:SS".
 * This module handles reading the configured timezone, validating it,
 * generating UTC timestamps, and converting UTC to local display time.
 *
 * Config-aware: accepts a JawiConfig object (or { display: { timezone } })
 * and falls back to import.meta.env for backward compatibility.
 */

/**
 * Read the configured timezone.
 * Priority: config.display.timezone > import.meta.env.PUBLIC_TIMEZONE > 'UTC'.
 * Special value 'USER' means client-side timezone detection (each visitor sees their own timezone).
 * @param {object} [config] - JawiConfig or { display: { timezone: string } }
 * @returns {string} IANA timezone string or 'USER'
 */
export function readTimezone(config) {
  // 1. Config parameter takes highest priority
  if (config && config.display && config.display.timezone) {
    const trimmed = config.display.timezone.trim();
    if (trimmed.toUpperCase() === 'USER') {
      return 'USER';
    }
    return validateTimezone(trimmed) ? trimmed : 'UTC';
  }

  // 2. Fall back to environment variable (backward compatibility)
  try {
    const envTz = import.meta.env.PUBLIC_TIMEZONE;
    if (envTz && envTz.trim() !== '') {
      const trimmed = envTz.trim();
      if (trimmed.toUpperCase() === 'USER') {
        return 'USER';
      }
      return validateTimezone(trimmed) ? trimmed : 'UTC';
    }
  } catch {
    // import.meta.env may not exist in all environments (e.g., Node.js)
  }

  // 3. Default
  return 'UTC';
}

/**
 * Check if the configured timezone is the special 'USER' value.
 * @param {object} [config] - JawiConfig or { display: { timezone: string } }
 * @returns {boolean}
 */
export function isUserTimezone(config) {
  return readTimezone(config) === 'USER';
}

/**
 * Validate an IANA timezone string.
 * Uses Intl.DateTimeFormat which throws on unsupported timezones.
 * @param {string} tz - IANA timezone (e.g. "Asia/Kolkata", "America/New_York")
 * @returns {boolean}
 */
export function validateTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz, hour: 'numeric' }).format(new Date());
    return true;
  } catch {
    if (typeof process !== 'undefined' && process.stdout) {
      console.warn(`Warning: Invalid timezone "${tz}". Falling back to UTC.`);
    }
    return false;
  }
}

/**
 * Generate current UTC time as "YYYY-MM-DD HH:MM:SS".
 * @returns {string}
 */
export function utcNow() {
  const d = new Date();
  return formatUTC(d);
}

/**
 * Format a Date object as UTC "YYYY-MM-DD HH:MM:SS".
 * @param {Date} d
 * @returns {string}
 */
export function formatUTC(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

/**
 * Parse a UTC time string "YYYY-MM-DD HH:MM:SS" into a Date object.
 * @param {string} utcTimeStr - e.g. "2026-05-26 21:30:00"
 * @returns {Date}
 */
export function parseUTC(utcTimeStr) {
  if (!utcTimeStr) return new Date(0);
  // Replace space with T for ISO parsing, append Z for UTC
  const iso = utcTimeStr.replace(' ', 'T') + 'Z';
  return new Date(iso);
}

/**
 * Convert a UTC time string to the configured local timezone.
 * Returns the same "YYYY-MM-DD HH:MM:SS" format but in local time.
 * When timezone is 'USER', returns the raw UTC string (client-side conversion).
 * @param {string} utcTimeStr - UTC time string
 * @param {string|object} [timezoneOrConfig] - IANA timezone string, or JawiConfig / { display: { timezone } }
 * @returns {string} Local time string in "YYYY-MM-DD HH:MM:SS" format
 */
export function toLocalTime(utcTimeStr, timezoneOrConfig) {
  if (!utcTimeStr) return '';

  let tz;
  if (typeof timezoneOrConfig === 'string') {
    // Explicit timezone string passed directly
    tz = timezoneOrConfig;
  } else {
    // Treat as config object (or undefined)
    tz = readTimezone(timezoneOrConfig);
  }

  // When timezone is 'USER', return raw UTC - client-side script handles conversion
  if (tz === 'USER') return utcTimeStr;
  const date = parseUTC(utcTimeStr);

  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '00';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Format a time string for display in the UI.
 * Shows date + hour:minute, e.g. "2026-05-27 07:30".
 * The input should already be in the desired timezone.
 * @param {string} timeStr - "YYYY-MM-DD HH:MM:SS"
 * @returns {string} e.g. "2026-05-27 07:30"
 */
export function formatForDisplay(timeStr) {
  if (!timeStr) return '';
  // Just strip the seconds part
  return timeStr.slice(0, 16);
}

/**
 * Pad a number to 2 digits.
 * @param {number} n
 * @returns {string}
 */
function pad(n) {
  return String(n).padStart(2, '0');
}
