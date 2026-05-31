/**
 * Extract the first heading from markdown content.
 * Returns the heading text without the `#` prefix.
 */
export function getFirstHeading(text) {
  if (!text) return '';
  const match = text.match(/^#{1,6}\s+(.+)$/m);
  return match ? match[1].trim() : '';
}
