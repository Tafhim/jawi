/**
 * Load all Prism.js language grammars used by the site.
 * Side-effect only import — no exports needed.
 *
 * Add new languages here so both parseMarkdown.js and codes/[slug].astro
 * stay in sync.
 */

import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-zig';
import 'prismjs/components/prism-xml-doc';
import 'prismjs/components/prism-markup';

export {};
