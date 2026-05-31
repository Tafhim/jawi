/**
 * Shared frontmatter parser used by findCodes.js and parseMarkdown.js.
 * Handles key: value, [array], and - list items.
 */

/**
 * Parse frontmatter from a markdown/code file.
 * @param {string} content - Full file content
 * @returns {{ frontmatter: Object, body: string }}
 */
export function parseFrontmatter(content) {
  const lines = content.split('\n');
  let frontmatter = {};
  let contentBody = '';
  let inFrontmatter = false;
  let currentKey = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      inFrontmatter = !inFrontmatter;
      if (!inFrontmatter) currentKey = null;
      continue;
    }

    if (inFrontmatter) {
      // List item continuation
      if (lines[i].trim().startsWith('- ') && currentKey) {
        const item = lines[i].trim().slice(2).replace(/^["']|["']$/g, '');
        frontmatter[currentKey].push(item);
        continue;
      }

      const match = lines[i].match(/^(\w+_?):\s*(.*)$/);
      if (match) {
        const key = match[1].replace(/:_$/, '');
        let value = match[2].trim();

        if (value.startsWith('[') && value.endsWith(']')) {
          const inner = value.slice(1, -1);
          frontmatter[key] = inner.split(',').map(item =>
            item.trim().replace(/^["']|["']$/g, '')).filter(item => item.length > 0);
        } else {
          const quoteMatch = value.match(/^["'](.*)["']$/);
          if (quoteMatch) {
            value = quoteMatch[1];
          }
          currentKey = key;
          frontmatter[currentKey] = value || [];
        }
        continue;
      }
    }

    // Collect content body (after frontmatter)
    if (!inFrontmatter && contentBody === '' && i > 0) {
      contentBody = lines.slice(i).join('\n');
      break;
    }
  }

  return { frontmatter, body: contentBody };
}
