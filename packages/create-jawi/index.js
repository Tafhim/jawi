#!/usr/bin/env node

import { mkdir, rm, cp, readFile, writeFile, access, readdir, copyFile } from 'fs/promises';
import { join, dirname, basename, relative, resolve } from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_DIR = join(__dirname, 'template');
const CORE_PACKAGE_DIR = join(__dirname, '..', 'core');

function resolveCorePath(targetDir) {
  // If running from local source (packages/core exists alongside create-jawi),
  // use a file: reference so npm install resolves locally.
  // Otherwise fall back to "latest" for published installs.
  const corePath = resolve(CORE_PACKAGE_DIR);
  if (existsSync(join(corePath, 'package.json'))) {
    const relPath = relative(targetDir, corePath);
    return `file:${relPath}`;
  }
  return 'latest';
}

const DATE_FORMATS = ['long', 'medium', 'short', 'compact', 'minimal', 'iso'];

// ─── Argument Parsing ────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2);
  const parsed = {
    dir: undefined,
    noInstall: false,
    yes: false,
    help: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (arg === '--no-install') {
      parsed.noInstall = true;
    } else if (arg === '--yes' || arg === '-y') {
      parsed.yes = true;
    } else if (!arg.startsWith('-')) {
      parsed.dir = arg;
    }
  }

  return parsed;
}

function showHelp() {
  console.log(`
create-jawi <directory> [options]

Create a new Jawi microblog site.

Options:
  --help, -h          Show this help message
  --no-install        Skip npm install
  --yes, -y           Accept defaults without prompts

Examples:
  create-jawi my-blog
  create-jawi my-blog --no-install
  create-jawi my-blog -y --no-install
`);
}

// ─── Prompts ─────────────────────────────────────────────────────────

function createPrompt() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return {
    ask(question, defaultVal) {
      const prompt = defaultVal
        ? `${question} [${defaultVal}]: `
        : `${question}: `;
      return new Promise((resolve) => {
        rl.question(prompt, (answer) => {
          resolve(answer.trim() || defaultVal);
        });
      });
    },
    close() {
      rl.close();
    },
  };
}

function validateTimezone(tz) {
  if (tz === 'USER' || tz === 'UTC') return true;
  try {
    new Date().toLocaleString('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function validateDateFormat(fmt) {
  return DATE_FORMATS.includes(fmt);
}

async function runPrompts(dir) {
  const p = createPrompt();

  console.log('\nLet\'s set up your Jawi site.\n');

  const siteTitle = await p.ask('Site title', 'My Microblog');
  const footerText = await p.ask('Footer text', siteTitle);

  let timezone = await p.ask('Timezone (IANA or USER)', 'UTC');
  while (!validateTimezone(timezone)) {
    console.log(`Invalid timezone: ${timezone}`);
    timezone = await p.ask('Timezone (IANA or USER)', 'UTC');
  }

  let dateFormat = await p.ask('Date format (long/medium/short/compact/minimal/iso)', 'long');
  while (!validateDateFormat(dateFormat)) {
    console.log(`Invalid format. Choose from: ${DATE_FORMATS.join(', ')}`);
    dateFormat = await p.ask('Date format', 'long');
  }

  p.close();

  return {
    siteName: basename(dir),
    siteTitle,
    footerText,
    timezone,
    dateFormat,
  };
}

// ─── Directory Check ─────────────────────────────────────────────────

async function dirExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// ─── File Generation ─────────────────────────────────────────────────

async function copyTemplate(targetDir, answers) {
  await mkdir(targetDir, { recursive: true });

  const files = [
    'astro.config.mjs',
    'jawi.config.mjs',
    '.gitignore',
    '.env.example',
    'README.md',
    'content/posts/.gitkeep',
    'content/codes/.gitkeep',
    'content/thoughts/.gitkeep',
    'public/images/.gitkeep',
  ];

  const replaceMap = {
    '{{SITE_NAME}}': answers.siteName,
    '{{SITE_TITLE}}': answers.siteTitle,
    '{{FOOTER_TEXT}}': answers.footerText,
    '{{TIMEZONE}}': answers.timezone,
    '{{DATE_FORMAT}}': answers.dateFormat,
    '{{CORE_PATH}}': resolveCorePath(targetDir),
  };

  for (const file of files) {
    const src = join(TEMPLATE_DIR, file);
    const dest = join(targetDir, file);

    await mkdir(dirname(dest), { recursive: true });

    let content = await readFile(src, 'utf-8');

    for (const [placeholder, value] of Object.entries(replaceMap)) {
      content = content.replaceAll(placeholder, value);
    }

    await writeFile(dest, content, 'utf-8');
  }

  // package.json needs special handling (JSON replacement)
  const pkgSrc = join(TEMPLATE_DIR, 'package.json');
  const pkgDest = join(targetDir, 'package.json');
  let pkgContent = await readFile(pkgSrc, 'utf-8');
  for (const [placeholder, value] of Object.entries(replaceMap)) {
    pkgContent = pkgContent.replaceAll(placeholder, value);
  }
  await writeFile(pkgDest, pkgContent, 'utf-8');

  // Copy src/pages/ directory from @jawi/core package (single source of truth)
  const pagesSrc = join(CORE_PACKAGE_DIR, 'src', 'pages');
  const pagesDest = join(targetDir, 'src', 'pages');
  if (existsSync(pagesSrc)) {
    await copyDirRecursive(pagesSrc, pagesDest);
  }
}

// ─── Directory Copy ────────────────────────────────────────────────────

async function copyDirRecursive(src, dest) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

// ─── NPM Install ─────────────────────────────────────────────────────

function runNpmInstall(targetDir) {
  console.log('\nInstalling dependencies...');

  const result = spawnSync('npm', ['install'], {
    cwd: targetDir,
    stdio: 'inherit',
    shell: true,
  });

  if (result.status !== 0) {
    console.error(`\nnpm install failed. You can run it manually: cd ${targetDir} && npm install`);
    return false;
  }

  return true;
}

// ─── Success Message ─────────────────────────────────────────────────

function showSuccess(targetDir, noInstall) {
  const steps = noInstall
    ? `cd ${targetDir}
npm install
npm run dev`
    : `cd ${targetDir}
npm run dev`;

  console.log(`
Jawi site scaffolded successfully!

Next steps:

${steps}

Visit http://localhost:4321 to see your site.

Create your first content:

  npx jawi create-post "tag1 tag2"
  npx jawi create-code --title "Hello" --language javascript
  npx jawi create-thought "tag1 tag2"
`);
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  // Get project directory
  let dir = args.dir;
  if (!dir) {
    const p = createPrompt();
    dir = await p.ask('Project directory', 'jawi-blog');
    p.close();
  }

  // Check if directory already exists
  if (await dirExists(dir)) {
    const p = createPrompt();
    const answer = await p.ask(`Directory "${dir}" already exists. Overwrite?`, 'N');
    p.close();
    if (answer.toLowerCase() !== 'y') {
      console.error('Aborted.');
      process.exit(1);
    }
    // Remove existing directory before scaffolding
    await rm(dir, { recursive: true, force: true });
  }

  // Run prompts for config (or use defaults with --yes)
  let answers;
  if (args.yes) {
    answers = {
      siteName: basename(dir),
      siteTitle: 'My Microblog',
      footerText: 'My Microblog',
      timezone: 'UTC',
      dateFormat: 'long',
    };
  } else {
    answers = await runPrompts(dir);
  }

  // Copy template
  console.log(`\nScaffolding ${dir}...`);
  await copyTemplate(dir, answers);

  // Install dependencies
  if (!args.noInstall) {
    const ok = runNpmInstall(dir);
    if (!ok) {
      showSuccess(dir, true);
      process.exit(1);
    }
  }

  // Show success
  showSuccess(dir, args.noInstall);
}

main().catch((err) => {
  console.error('Unexpected error:', err.message);
  process.exit(1);
});
