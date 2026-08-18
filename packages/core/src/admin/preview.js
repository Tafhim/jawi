/**
 * Markdown preview rendering for the Jawi admin panel.
 *
 * Reuses the framework's own parseMarkdown pipeline (emoji conversion,
 * CodeContent embeds, Link cards, Prism highlighting) so the admin preview
 * matches the built site exactly. Link OG fetches are skipped (offline).
 */

import { parseMarkdown } from '../utils/parseMarkdown.js';
import { findCodes } from '../utils/findCodes.js';
import Prism from 'prismjs';
import '../utils/loadPrismLanguages.js';

/**
 * Create a preview renderer bound to a content directory.
 * @param {Object} opts
 * @param {string} opts.contentDir - Absolute content directory
 */
export function createPreviewRenderer({ contentDir }) {
  /**
   * Render a post or thought body to HTML.
   * @param {string} body - Markdown body
   * @param {string} filename - Filename (for slug-based embed resolution)
   * @returns {Promise<string>} HTML
   */
  async function renderMarkdown(body, filename = 'preview.md') {
    const content = `---\ntime: 2026-01-01 00:00:00\n---\n\n${body || ''}`;
    const codes = await findCodes(contentDir).catch(() => []);
    const result = await parseMarkdown(content, filename, codes, {
      baseDir: contentDir,
      skipLinkFetch: true,
    });
    return result.contentHtml;
  }

  /**
   * Render a code snippet body to highlighted HTML.
   * @param {string} body - Raw code
   * @param {string} language - Prism language key
   * @returns {string} HTML (a <pre><code> block)
   */
  function renderCode(body, language) {
    const languageMap = { astro: 'markup' };
    const grammarKey = languageMap[language] || language;
    const grammar = Prism.languages[grammarKey] || Prism.languages.javascript;
    let highlighted;
    try {
      highlighted = Prism.highlight(body || '', grammar, grammarKey);
    } catch {
      highlighted = Prism.util.encodeHTML(body || '');
    }
    return `<pre><code class="language-${grammarKey}">${highlighted}</code></pre>`;
  }

  return { renderMarkdown, renderCode };
}
