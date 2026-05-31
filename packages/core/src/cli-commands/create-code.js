/**
 * Create a new code snippet file automatically
 * @usage jawi create-code [[options]]
 *
 * Examples:
 *   jawi create-code                         # interactive prompts
 *   jawi create-code --title "Hello" --language python --tags "python,example"
 *   jawi create-code --title "Script" --language bash --tags "script,demo" --md
 */

import { writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { stdin, stdout } from 'process';
import { promisify } from 'util';
import { utcNow } from '../utils/timezone.js';
import { loadConfig } from '../config.js';

const rl = promisify(stdin.addListener.bind(stdin));

// Languages registered in the build via Prism.js component imports.
// Used by src/pages/codes/[slug].astro and src/utils/parseMarkdown.js
const VALID_LANGUAGES = [
  'astro',
  'bash',
  'c',
  'cpp',
  'css',
  'go',
  'java',
  'javascript',
  'jsx',
  'json',
  'markdown',
  'python',
  'rust',
  'typescript',
  'tsx',
  'xml-doc',
  'yaml',
  'zig',
];

function generateSlug() {
  return randomUUID().replace(/-/g, '');
}

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--title') || arg.startsWith('-t')) {
      result.title = arg.split('=').length > 1 ? arg.split('=')[1] : args[++i];
    } else if (arg.startsWith('--language') || arg.startsWith('-l')) {
      result.language = arg.split('=').length > 1 ? arg.split('=')[1] : args[++i];
    } else if (arg.startsWith('--tags') || arg.startsWith('-T')) {
      result.tags = arg.split('=').length > 1 ? arg.split('=')[1] : args[++i];
    } else if (arg === '--md') {
      result.md = true;
    } else if (arg.startsWith('--md')) {
      result.md = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2);
      result[key] = args[++i];
    }
  }
  return result;
}

function validateLanguage(lang) {
  return VALID_LANGUAGES.includes(lang);
}

async function prompt(question, defaultValue = '') {
  stdout.write(`${question}${defaultValue ? ` [${defaultValue}]` : ''}: `);
  return new Promise((resolve) => {
    rl(() => {
      stdin.resume();
      stdin.setEncoding('utf8');
      stdin.once('data', (data) => {
        const answer = data.toString().trim();
        resolve(answer || defaultValue || '');
      });
    });
  });
}

export async function createCode(args) {
  const config = await loadConfig(process.cwd());
  const codesDir = config.content.dir + '/codes';

  const options = parseArgs(Array.isArray(args) ? args : []);
  const { md, title: promptTitle, language: promptLang, tags: promptTags } = options;

  // ---------- Title ----------
  let codeTitle = promptTitle;
  if (!codeTitle) {
    codeTitle = await prompt('Title (displayed on detail/list pages)', 'Untitled Code');
  }

  // ---------- Language (validated) ----------
  let lang = promptLang;
  const langList = VALID_LANGUAGES.join(', ');

  // CLI mode: validate and error on invalid
  if (promptLang && !validateLanguage(lang)) {
    console.error(`\n❌ Invalid language: "${lang}"`);
    console.error(`   Valid languages: ${langList}`);
    process.exit(1);
  }

  // Interactive mode: re-prompt until valid
  if (!lang) {
    let attempts = 0;
    do {
      lang = await prompt(`Language (${langList})`, '');
      attempts++;
      if (attempts > 5) {
        console.error('\n❌ Too many invalid attempts. Aborting.');
        process.exit(1);
      }
      if (lang && !validateLanguage(lang)) {
        console.error(`  Invalid: "${lang}" — must be one of: ${langList}`);
        lang = undefined;
      }
    } while (!lang);
  }

  // ---------- Tags ----------
  // Only prompt for tags in fully interactive mode (no CLI flags provided).
  // In CLI mode (title+language provided), tags default to empty array.
  let codeTags = [];
  if (promptTags) {
    codeTags = promptTags.split(',').map(t => t.trim()).filter(t => t.length > 0);
  } else if (!promptTitle && !promptLang) {
    const tagInput = await prompt('Tags (comma-separated, e.g. python,example)', '');
    codeTags = tagInput ? tagInput.split(',').map(t => t.trim()).filter(t => t.length > 0) : [];
  }

  const isMD = !!md;
  const fileExt = isMD ? '.md' : '.mdx';
  const slug = generateSlug();
  const time = utcNow();

  console.log(`\nCreating code snippet...`);
  console.log(`   Title:    ${codeTitle}`);
  console.log(`   Language: ${lang}`);
  console.log(`   Tags:     ${codeTags.join(', ') || '(none)'}`);
  console.log(`   Slug:     ${slug}`);
  console.log(`   File:     ${fileExt}`);

  let content;
  if (!isMD) {
    content = [
      '---',
      `time: ${time}`,
      `title: ${codeTitle}`,
      `language: ${lang}`,
      ...(codeTags.length > 0 ? [`tags: [${codeTags.join(', ')}]`] : []),
      '---',
      '',
      '---'    // Astro import block separator
    ].join('\n');
  } else {
    content = [
      '---',
      `time: ${time}`,
      `title: ${codeTitle}`,
      `language: ${lang}`,
      ...(codeTags.length > 0 ? [`tags: [${codeTags.join(', ')}]`] : []),
      '---'
    ].join('\n');
  }

  const outputPath = `${codesDir}/${slug}${fileExt}`;

  await mkdir(codesDir, { recursive: true });
  await writeFile(outputPath, content, 'utf-8');

  console.log(`\n✅ Code snippet created!`);
  console.log(`   Path: ${outputPath}`);
  console.log(`\nNext steps:`);
  console.log(`   1. Edit the file and add your code`);
  console.log(`   2. Reference it in posts: {<CodeContent slug="${slug}" />}`);
  console.log(`   3. Run \`npm run build\``);
}
