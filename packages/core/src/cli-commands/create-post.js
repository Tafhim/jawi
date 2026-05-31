/**
 * Create a new markdown post automatically
 * @usage jawi create-post [[tags]]
 *
 * Examples:
 *   jawi create-post
 *   jawi create-post "coding ai"
 */

import { writeFile, mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { utcNow } from '../utils/timezone.js';
import { loadConfig } from '../config.js';

function generateSlug() {
  return randomUUID().replace(/-/g, '');
}

export async function createPost(args) {
  const config = await loadConfig(process.cwd());
  const postsDir = config.content.dir + '/posts';

  const tags = Array.isArray(args) ? args.join(' ') : '';
  const time = utcNow();
  const slug = generateSlug();
  const parsedTags = (tags || '')
    .split(' ')
    .map(t => t.trim())
    .filter(t => t.length > 0);

  console.log('\n📝 Creating post...');
  console.log(`   Slug: ${slug}`);

  if (parsedTags.length > 0) {
    console.log(`   Tags: ${parsedTags.join(', ')}`);
  }

  // Prompt for title
  const { createInterface } = await import('readline');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const title = await new Promise(resolve => {
    rl.question('   Title: ', answer => resolve(answer.trim()));
  });
  rl.close();

  if (!title) {
    console.error('\n❌ Title is required.');
    process.exit(1);
  }

  const filename = `${slug}.md`;
  const outputPath = `${postsDir}/${filename}`;

  await mkdir(postsDir, { recursive: true });

  let tagsBlock = '';
  if (parsedTags.length > 0) {
    tagsBlock = parsedTags.map(t => `  - "#${t}"`).join('\n');
  }

  const content = `---
time: ${time}
slug: ${slug}
title: ${title}
tags:
${tagsBlock}
images:
  - "/images/placeholder.jpg"
---

## Introduction

This is a new post. Add your content here.

---

## Content Body

Replace this placeholder content with your actual blog post.

---

## Conclusion

Your content ends here.
`;

  await writeFile(outputPath, content, 'utf-8');

  console.log(`\n✅ Post created!`);
  console.log(`   Path: ${outputPath}`);
  console.log(`\n⚠️  Next steps:`);
  console.log(`   1. Edit the content in the file`);
  console.log(`   2. Add images to /public/images/`);
  console.log(`   3. Run \`npm run build\``);
}
