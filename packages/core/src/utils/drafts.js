/**
 * Draft support for Jawi content.
 *
 * Any content file (post, thought, code) with `draft: true` in its
 * frontmatter is excluded from the build unless the JAWI_INCLUDE_DRAFTS
 * environment variable is set to a truthy value:
 *
 *   JAWI_INCLUDE_DRAFTS=true npm run build
 *
 * Works in both the Astro build (process.env for shell-set vars,
 * import.meta.env for .env files) and the CLI (process.env).
 */

/**
 * Whether the current build/dev run should include draft content.
 * @returns {boolean}
 */
export function includeDrafts() {
  const envValue =
    (typeof process !== 'undefined' && process.env && process.env.JAWI_INCLUDE_DRAFTS) ||
    (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.JAWI_INCLUDE_DRAFTS);
  return ['1', 'true', 'yes', 'on'].includes(String(envValue || '').toLowerCase());
}

/**
 * Check whether a frontmatter object marks the item as a draft.
 * Handles both real booleans and the string values returned by
 * parseFrontmatter (e.g. `draft: true` parses to 'true').
 * @param {Object} frontmatter - Parsed frontmatter object
 * @returns {boolean}
 */
export function isDraft(frontmatter) {
  if (!frontmatter) return false;
  const d = frontmatter.draft;
  return d === true || d === 1 || d === 'true' || d === '1';
}
