/**
 * Create a new thought (short-form post) automatically
 * @usage jawi create-thought [--color COLOR] [[tags]]
 *
 * Color formats:
 *   solid-[name]              - flat color (e.g. solid-blue)
 *   solid-#hex                - flat hex color (e.g. solid-#efefef)
 *   gradient-[name]-[name]... - gradient with named colors (e.g. gradient-red-purple)
 *   gradient-#hex-#hex...     - gradient with hex colors (e.g. gradient-#000-#fff)
 *   [name]                    - legacy single-name gradient (e.g. blue)
 *
 * Named colors: black, white, red, orange, yellow, green, teal, blue, purple, pink, gray
 *
 * Examples:
 *   jawi create-thought
 *   jawi create-thought "coding ai"
 *   jawi create-thought --color solid-blue "coding ai"
 *   jawi create-thought --color gradient-red-purple "coding ai"
 *   jawi create-thought --color gradient-#000-#333-#666 "coding ai"
 */

import { writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { utcNow } from '../utils/timezone.js';
import { loadConfig } from '../config.js';

const VALID_COLORS = ['black', 'white', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];

function isValidColor(color) {
  const c = color.toLowerCase();
  if (c.startsWith('solid-')) {
    const val = c.slice(6);
    if (val.startsWith('#') && /^#[0-9a-fA-F]{3,8}$/.test(val)) return true;
    return VALID_COLORS.includes(val);
  }
  if (c.startsWith('gradient-')) {
    const stops = c.slice(9);
    if (!stops) return false;
    // Split on -# for hex, or - for names
    const tokens = stops.match(/#[0-9a-fA-F]{3,8}|\b[a-zA-Z]+\b/g);
    if (!tokens || tokens.length < 2) return false;
    return tokens.every(t => t.startsWith('#') || VALID_COLORS.includes(t.toLowerCase()));
  }
  return VALID_COLORS.includes(c);
}

function generateSlug() {
  return randomUUID().replace(/-/g, '');
}

function parseArgs(args) {
  let color = '';
  let tags = '';

  if (args.includes('--color')) {
    const colorIndex = args.indexOf('--color');
    if (colorIndex + 1 < args.length) {
      color = args[colorIndex + 1].toLowerCase();
      if (!isValidColor(color)) {
        console.log(`\n Warning: Invalid color "${args[colorIndex + 1]}".`);
        console.log(` Examples: solid-blue, gradient-red-purple, gradient-#000-#fff`);
        console.log(` Named colors: ${VALID_COLORS.join(', ')}`);
        console.log(` The background will use the default color.\n`);
        color = '';
      }
      // Remove --color and its value from args to get remaining tags
      args = [...args.slice(0, colorIndex), ...args.slice(colorIndex + 2)];
    }
  }

  tags = args.join(' ');
  return { color, tags };
}

export async function createThought(args) {
  const config = await loadConfig(process.cwd());
  const thoughtsDir = config.content.dir + '/thoughts';

  const argArray = Array.isArray(args) ? args : (typeof args === 'string' ? args.split(' ') : []);
  const { color, tags } = parseArgs(argArray);

  const time = utcNow();
  const slug = generateSlug();
  const parsedTags = (tags || '')
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  console.log('\n Creating thought...');
  console.log(`   Slug: ${slug}`);

  if (color) {
    console.log(`   Color: ${color}`);
  }

  if (parsedTags.length > 0) {
    console.log(`   Tags: ${parsedTags.join(', ')}`);
  }

  const filename = `${slug}.md`;
  const outputPath = `${thoughtsDir}/${filename}`;

  await mkdir(thoughtsDir, { recursive: true });

  let tagsBlock = '';
  if (parsedTags.length > 0) {
    tagsBlock = parsedTags.map(t => `  - "#${t}"`).join('\n');
  }

  const colorLine = color ? `color: ${color}\n` : '';

  const content = `---
time: ${time}
slug: ${slug}
${colorLine}tags:
${tagsBlock}
---

Write your thought here...
`;

  await writeFile(outputPath, content, 'utf-8');

  console.log(`\n Thought created!`);
  console.log(`   Path: ${outputPath}`);
  console.log(`\n Next steps:`);
  console.log(`   1. Edit the content in the file`);
  console.log(`   2. Run \`npm run build\``);
}
