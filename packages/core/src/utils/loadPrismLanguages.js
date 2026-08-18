/**
 * Load all Prism.js language grammars used by the site.
 * Side-effect only import — no exports needed.
 *
 * Add new languages here so both parseMarkdown.js and codes/[slug].astro
 * stay in sync.
 */

import 'prismjs/components/prism-javascript.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-css.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-zig.js';
import 'prismjs/components/prism-xml-doc.js';
import 'prismjs/components/prism-markup.js';

export {};
