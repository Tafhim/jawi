/**
 * Normalize a tag for URL-safe comparison.
 * Strips all leading '#' characters and lowercases.
 */
export function normalizeTag(tag) {
  return tag.replace(/^#+/, '').toLowerCase();
}
