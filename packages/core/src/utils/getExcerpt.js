/**
 * Generate a human-readable excerpt from post markdown content.
 *
 * - Strips YAML frontmatter (metadata section) first
 * - Replaces special component placeholders with readable text
 * - Skips blank lines and horizontal rules (`---`)
 * - Strips markdown formatting (headers, bold, italic, inline code)
 * - Replaces `[text](url)` with just `text`
 * - Takes up to the first 3 meaningful lines, truncates with `...`
 */
export function getExcerpt(text, maxChars = 150) {
  if (!text) return '';

  // Step 1: Strip YAML frontmatter if present
  const frontmatterMatch = text.match(/^---\n[\s\S]*?\n---/);
  let body = frontmatterMatch
    ? text.slice(frontmatterMatch[0].length)
    : text;

// Step 2: Replace special component patterns with human-readable text
  let cleaned = body
    // {<CodeContent slug="..." />} or <CodeContent slug="..." />
    .replace(/\{?\s*<CodeContent\s+[^>]*>\s*\}?/g, ' <span class="excerpt-embed">Contains code snippet</span> ')
    // {<Code ... />} or <Code ... />
    .replace(/\{?\s*<Code\b[^>]*>\s*\}?/g, ' <span class="excerpt-embed">Contains code</span> ')
    // {<Link ... />} or <Link ... />
    .replace(/\{?\s*<Link\b[^>]*>\s*\}?/g, ' <span class="excerpt-embed">Contains link</span> ')
    // ![alt](url) markdown images
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' <span class="excerpt-embed">Contains image</span> ');

  // Step 3: Split into lines, filter empty and horizontal rules
  const lines = cleaned.split('\n');
  const meaningful = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed !== '' && trimmed !== '---' && trimmed !== '***';
  });

  // Step 4: Take first 10 meaningful lines and join
  let excerpt = meaningful.slice(0, 10).join(' ');

  // Step 5: Strip markdown formatting
  excerpt = excerpt
    // Remove headers: ## Text → Text
    .replace(/^#{1,6}\s+/g, '')
    .replace(/#{1,6}\s+/g, ' ')
    // Remove bold: **text** → text
    .replace(/\*\*([^*]+?)\*\*/g, '$1')
    // Remove italic: *text* → text (but not ** which is bold)
    .replace(/\*([^*]+?)\*/g, '$1')
    // Remove inline code backticks
    .replace(/`([^`]+?)`/g, '$1')
    // Replace links: [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

  // Step 6: Normalize and truncate
  excerpt = excerpt.replace(/\s+/g, ' ').trim();
  if (excerpt.length > maxChars) {
    const cutoff = excerpt.slice(0, maxChars).lastIndexOf(' ');
    if (cutoff > 0) {
      excerpt = excerpt.slice(0, cutoff) + '...';
    } else {
      excerpt = excerpt.slice(0, maxChars - 3) + '...';
    }
  }

  return excerpt || 'No preview available';
}
