/**
 * Format a local time string for display.
 *
 * The input is a "YYYY-MM-DD HH:MM:SS" string already converted to the
 * configured timezone (via toLocalTime()).
 *
 * Format is controlled by config.display.dateFormat, or preset parameter,
 * or falls back to import.meta.env.PUBLIC_DATE_FORMAT for backward compatibility.
 *
 * Presets:
 *   long     - "Monday, 26th May, 2026 at 10:12 PM"  (default)
 *   medium   - "26th May, 2026 at 10:12 PM"
 *   short    - "26 May 2026, 10:12 PM"
 *   compact  - "May 26, 2026"
 *   minimal  - "26/05/2026"
 *   iso      - "2026-05-26 22:12"
 */

/**
 * Pure formatting helpers (no import.meta.env) -- safe for client-side use.
 */
export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function to12Hour(h, m) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return { hour: String(hour12), minute: String(m).padStart(2, '0'), ampm };
}

export function getDayOfWeek(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}

export function parseTimeStr(timeStr) {
  if (!timeStr) return null;
  const [datePart, timePart] = timeStr.split(' ');
  if (!datePart || !timePart) return null;

  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);

  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;

  const dow = getDayOfWeek(year, month, day);
  const { hour: h12, minute: min, ampm } = to12Hour(hour || 0, minute || 0);

  return {
    year,
    month,
    day,
    hour: hour || 0,
    minute: minute || 0,
    second: second || 0,
    dow,
    h12,
    min,
    ampm,
    dayName: DAYS[dow],
    dayShort: DAYS_SHORT[dow],
    monthName: MONTHS[month - 1],
    monthShort: MONTHS_SHORT[month - 1],
    dayOrdinal: ordinal(day),
  };
}

export function formatWithPreset(p, preset) {
  switch (preset) {
    case 'long':
      return `${p.dayName}, ${p.dayOrdinal} ${p.monthName}, ${p.year} at ${p.h12}:${p.min} ${p.ampm}`;
    case 'medium':
      return `${p.dayOrdinal} ${p.monthName}, ${p.year} at ${p.h12}:${p.min} ${p.ampm}`;
    case 'short':
      return `${p.day} ${p.monthShort} ${p.year}, ${p.h12}:${p.min} ${p.ampm}`;
    case 'compact':
      return `${p.monthShort} ${p.day}, ${p.year}`;
    case 'minimal':
      return `${p.day}/${String(p.month).padStart(2, '0')}/${p.year}`;
    case 'iso':
      return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
    default:
      return `${p.dayName}, ${p.dayOrdinal} ${p.monthName}, ${p.year} at ${p.h12}:${p.min} ${p.ampm}`;
  }
}

/**
 * Resolve the date format preset from multiple sources.
 * Priority: preset param > config.display.dateFormat > import.meta.env.PUBLIC_DATE_FORMAT > 'long'.
 * @param {string} [preset] - explicit preset name
 * @param {object} [config] - JawiConfig or { display: { dateFormat: string } }
 * @returns {string} resolved preset name (lowercased)
 */
function resolvePreset(preset, config) {
  // 1. Explicit preset parameter takes highest priority
  if (preset) {
    return preset.toLowerCase();
  }

  // 2. Config parameter
  if (config && config.display && config.display.dateFormat) {
    return config.display.dateFormat.toLowerCase();
  }

  // 3. Fall back to environment variable (backward compatibility)
  try {
    const envFormat = import.meta.env.PUBLIC_DATE_FORMAT;
    if (envFormat) {
      return envFormat.toLowerCase();
    }
  } catch {
    // import.meta.env may not exist in all environments (e.g., Node.js)
  }

  // 4. Default
  return 'long';
}

/**
 * Main export. Format a local time string for display.
 * @param {string} timeStr - "YYYY-MM-DD HH:MM:SS" in the desired timezone
 * @param {string} [preset] - format preset (overrides config and env var if provided)
 * @param {object} [config] - JawiConfig or { display: { dateFormat: string } }
 * @returns {string}
 */
export function formatDate(timeStr, preset, config) {
  if (!timeStr) return '';

  const parsed = parseTimeStr(timeStr);
  if (!parsed) return timeStr.slice(0, 16); // fallback

  const usePreset = resolvePreset(preset, config);
  return formatWithPreset(parsed, usePreset);
}

/**
 * Client-side version: convert UTC time string to the visitor's local timezone
 * and format it using the specified preset.
 *
 * This function is safe to run in the browser - no import.meta.env dependency.
 * @param {string} utcTimeStr - "YYYY-MM-DD HH:MM:SS" in UTC
 * @param {string} [preset] - format preset (default: 'long')
 * @returns {string} Formatted date string in the visitor's local timezone
 */
export function formatDateClientSide(utcTimeStr, preset) {
  if (!utcTimeStr) return '';

  // Parse UTC string to Date object
  const [datePart, timePart] = utcTimeStr.split(' ');
  if (!datePart || !timePart) return utcTimeStr.slice(0, 16);

  const iso = utcTimeStr.replace(' ', 'T') + 'Z';
  const date = new Date(iso);
  if (isNaN(date.getTime())) return utcTimeStr.slice(0, 16);

  // Convert to visitor's local timezone using Intl.DateTimeFormat
  const formatter = new Intl.DateTimeFormat('en', {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
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

  const localTimeStr = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;

  const parsed = parseTimeStr(localTimeStr);
  if (!parsed) return localTimeStr.slice(0, 16);

  const usePreset = preset || 'long';
  return formatWithPreset(parsed, usePreset.toLowerCase());
}
