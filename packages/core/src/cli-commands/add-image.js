/**
 * Add an image to the site's public/images directory.
 * @usage jawi add-image <path> [more paths...]
 *
 * Images are copied to public/images/YYYY-MM/ using the current month,
 * e.g. public/images/2026-08/. The directory is created if missing.
 *
 * Examples:
 *   jawi add-image /home/tfm/Pictures/sample.jpg
 *   jawi add-image ~/Pictures/a.png ~/Pictures/b.png
 *   jawi add-image /home/tfm/Pictures/sample.jpg --force
 */

import { copyFile, mkdir, stat } from 'fs/promises';
import { basename, join, resolve } from 'path';

function currentMonthDir() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function addImage(args) {
  const argArray = Array.isArray(args) ? args : [];
  const paths = argArray.filter(a => !a.startsWith('--'));
  const force = argArray.includes('--force');

  if (paths.length === 0) {
    console.error('Usage: jawi add-image <path-to-image> [more paths...]');
    console.error('Example: jawi add-image /home/tfm/Pictures/sample.jpg');
    console.error('Use --force to overwrite existing files.');
    process.exit(1);
  }

  const monthDir = currentMonthDir();
  const destDir = resolve(process.cwd(), 'public', 'images', monthDir);
  await mkdir(destDir, { recursive: true });

  for (const src of paths) {
    const srcPath = resolve(process.cwd(), src);

    let stats;
    try {
      stats = await stat(srcPath);
    } catch {
      console.error(`\n❌ Source file not found: ${srcPath}`);
      process.exitCode = 1;
      continue;
    }

    if (!stats.isFile()) {
      console.error(`\n❌ Not a file: ${srcPath}`);
      process.exitCode = 1;
      continue;
    }

    const destPath = join(destDir, basename(srcPath));

    if (!force) {
      try {
        await stat(destPath);
        console.log(`\n⚠️  Already exists, skipping: ${destPath}`);
        console.log('   Use --force to overwrite.');
        continue;
      } catch {
        // Destination doesn't exist - safe to copy
      }
    }

    await copyFile(srcPath, destPath);
    console.log(`\n✅ Copied image`);
    console.log(`   Source: ${srcPath}`);
    console.log(`   Path:   ${destPath}`);
    console.log(`   URL:    /images/${monthDir}/${basename(srcPath)}`);
  }
}
