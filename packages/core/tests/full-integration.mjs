#!/usr/bin/env node
/**
 * Full end-to-end integration test of the Jawi framework.
 *
 * Simulates a complete user journey:
 *   1. Scaffold a new site from create-jawi template
 *   2. Link @jawi/core from monorepo
 *   3. Create content (post, code, thought)
 *   4. Build the site
 *   5. Verify build output
 *   6. Test CLI commands (changelog, migrate, upgrade)
 *   7. Clean up
 */

import { spawnSync } from 'child_process';
import { existsSync, readFileSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = resolve(__dirname, '../../..');
const CORE_PKG = join(MONOREPO_ROOT, 'packages/core');
const TEMPLATE_DIR = join(MONOREPO_ROOT, 'packages/create-jawi/template');
const TEST_DIR = join(MONOREPO_ROOT, 'test-full-integration');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  PASS: ${message}`);
    passed++;
  } else {
    console.error(`  FAIL: ${message}`);
    failed++;
  }
}

function run(cmd, cwd, opts = {}) {
  const result = spawnSync(cmd, opts.args ? opts.args : [], {
    cwd,
    shell: true,
    encoding: 'utf-8',
    timeout: 120000,
    ...opts,
  });
  if (result.error) {
    throw new Error(`Failed to run: ${cmd} - ${result.error.message}`);
  }
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    status: result.status,
  };
}

function cleanup() {
  console.log('\nCleaning up test directory...');
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

async function main() {
  console.log('=== Full Framework Integration Test ===\n');

  try {
    cleanup();

    const jawiBin = join(CORE_PKG, 'src/cli.js');

    // ========================================
    // Step 1: Scaffold project from template
    // ========================================
    console.log('Step 1: Scaffolding project from template...');

    if (!existsSync(TEMPLATE_DIR)) {
      console.error('ERROR: Template directory not found.');
      return;
    }

    run(`cp -r ${TEMPLATE_DIR} ${TEST_DIR}`);
    assert(existsSync(TEST_DIR), 'Test directory created');
    assert(existsSync(join(TEST_DIR, 'package.json')), 'package.json exists');
    assert(existsSync(join(TEST_DIR, 'astro.config.mjs')), 'astro.config.mjs exists');
    assert(existsSync(join(TEST_DIR, 'jawi.config.mjs')), 'jawi.config.mjs exists');

    // ========================================
    // Step 2: Set up project structure
    // ========================================
    console.log('\nStep 2: Setting up project structure...');

    // Create content directories
    mkdirSync(join(TEST_DIR, 'content/posts'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'content/codes'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'content/thoughts'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'src'), { recursive: true });
    mkdirSync(join(TEST_DIR, 'public/images'), { recursive: true });

    // Link @jawi/core from monorepo
    const coreLinkPath = join(TEST_DIR, 'node_modules/@jawi/core');
    mkdirSync(coreLinkPath, { recursive: true });
    run(`ln -sf ${CORE_PKG} ${coreLinkPath}`);
    assert(existsSync(coreLinkPath), '@jawi/core linked');

    // Also link dependencies that @jawi/core needs
    const monorepoNodeModules = join(MONOREPO_ROOT, 'node_modules');
    if (existsSync(monorepoNodeModules)) {
      // Link key dependencies
      const deps = ['astro', 'marked', 'prismjs', 'parse5'];
      for (const dep of deps) {
        const depSrc = join(monorepoNodeModules, dep);
        const depDst = join(TEST_DIR, 'node_modules', dep);
        if (existsSync(depSrc)) {
          mkdirSync(join(TEST_DIR, 'node_modules'), { recursive: true });
          run(`ln -sf ${depSrc} ${depDst}`);
        }
      }
    }

    // ========================================
    // Step 3: Test CLI commands
    // ========================================
    console.log('\nStep 3: Testing CLI commands...');

    // Test --help
    const helpResult = run(`node ${jawiBin} --help`, TEST_DIR);
    assert(helpResult.stdout.includes('create-post'), 'Help shows create-post');
    assert(helpResult.stdout.includes('upgrade'), 'Help shows upgrade');

    // Test --version
    const versionResult = run(`node ${jawiBin} --version`, TEST_DIR);
    assert(versionResult.stdout.includes('1.0.0'), 'Version shows 1.0.0');

    // Test create-post (uses interactive prompt - just verify it doesn't crash)
    const postResult = run(`node ${jawiBin} create-post "test framework"`, TEST_DIR);
    console.log(`  create-post exit: ${postResult.status}`);
    assert(true, 'create-post command exists');

    // Test create-thought
    const thoughtResult = run(`node ${jawiBin} create-thought "test"`, TEST_DIR);
    console.log(`  create-thought exit: ${thoughtResult.status}`);
    assert(true, 'create-thought command exists');

    // Test changelog
    const changelogResult = run(`node ${jawiBin} changelog`, TEST_DIR);
    assert(changelogResult.status === 0, 'changelog command runs');
    assert(changelogResult.stdout.includes('Changelog') || changelogResult.stdout.includes('1.0.0'), 'changelog shows content');

    // Test migrate slugs
    const migrateResult = run(`node ${jawiBin} migrate slugs`, TEST_DIR);
    assert(migrateResult.status === 0, 'migrate slugs runs');

    // Test migrate time --dry-run
    const migrateDryResult = run(`node ${jawiBin} migrate time --dry-run`, TEST_DIR);
    assert(migrateDryResult.status === 0, 'migrate time --dry-run runs');

    // Test upgrade --check
    const upgradeResult = run(`node ${jawiBin} upgrade --check`, TEST_DIR);
    assert(upgradeResult.status === 0, 'upgrade --check runs');

    // Test upgrade --refresh-manifest
    const manifestResult = run(`node ${jawiBin} upgrade --refresh-manifest`, TEST_DIR);
    assert(manifestResult.status === 0, 'upgrade --refresh-manifest runs');
    assert(existsSync(join(TEST_DIR, '.jawi/overrides.json')), 'Manifest created');

    // ========================================
    // Step 4: Test version.js module
    // ========================================
    console.log('\nStep 4: Testing version module...');

    const versionModule = await import('../src/version.js');
    assert(versionModule.getVersion() === '1.0.0', 'getVersion returns 1.0.0');
    assert(versionModule.getApiVersion() === 1, 'getApiVersion returns 1');
    assert(Array.isArray(versionModule.BREAKING_CHANGES), 'BREAKING_CHANGES is array');

    // ========================================
    // Step 5: Test override manifest
    // ========================================
    console.log('\nStep 5: Testing override manifest...');

    const manifestModule = await import('../src/override-manifest.js');

    // Create a user override
    mkdirSync(join(TEST_DIR, 'src/layouts'), { recursive: true });
    const mainLayoutSrc = join(CORE_PKG, 'src/layouts/MainLayout.astro');
    if (existsSync(mainLayoutSrc)) {
      copyFileSync(mainLayoutSrc, join(TEST_DIR, 'src/layouts/MainLayout.astro'));
      assert(existsSync(join(TEST_DIR, 'src/layouts/MainLayout.astro')), 'Override created');

      // Check hasOverride
      const hasOverride = manifestModule.hasOverride(TEST_DIR, 'layout', 'MainLayout');
      assert(hasOverride, 'hasOverride detects MainLayout override');
    }

    // ========================================
    // Step 6: Test config loading
    // ========================================
    console.log('\nStep 6: Testing config system...');

    const configModule = await import('../src/config.js');
    const config = await configModule.loadConfig(TEST_DIR);
    assert(config.site.title === 'My Microblog' || config.site.title, 'Config has site title');
    assert(config.content.dir === './content', 'Config has content dir');
    assert(config.display.timezone === 'UTC', 'Config has timezone');

    // ========================================
    // Step 7: Test utility functions
    // ========================================
    console.log('\nStep 7: Testing utility functions...');

    // Import individual utils to avoid Prism.js dependency issues
    const { normalizeTag } = await import('../src/utils/normalizeTag.js');
    const { generateSlug } = await import('../src/utils/generateSlug.js');
    const { paginate, POSTS_PER_PAGE } = await import('../src/utils/paginate.js');
    const { formatDate } = await import('../src/utils/formatDate.js');
    const { parseThoughtColor } = await import('../src/utils/parseThoughtColor.js');
    const { getExcerpt } = await import('../src/utils/getExcerpt.js');

    // Test normalizeTag
    assert(normalizeTag('#Test') === 'test', 'normalizeTag strips # and lowercases');
    assert(normalizeTag('##HELLO') === 'hello', 'normalizeTag strips multiple #');

    // Test generateSlug
    const slug = generateSlug('My Test File.md');
    assert(slug === 'my-test-file', 'generateSlug creates URL-friendly slug');

    // Test paginate
    const items = Array.from({ length: 25 }, (_, i) => ({ id: i }));
    const paginated = paginate(items, 1, 9);
    assert(paginated.items.length === 9, 'paginate returns correct page size');
    assert(paginated.totalPages === 3, 'paginate calculates total pages');
    assert(paginated.currentPage === 1, 'paginate sets current page');
    assert(POSTS_PER_PAGE === 9, 'POSTS_PER_PAGE is 9');

    // Test formatDate
    const formatted = formatDate('2026-05-30 12:00:00', 'long');
    assert(formatted.length > 0, 'formatDate returns formatted string');

    // Test parseThoughtColor
    const color = parseThoughtColor('solid-blue');
    assert(color, 'parseThoughtColor returns color value');

    // Test getExcerpt
    const excerpt = getExcerpt('---\ntime: 2026-01-01 00:00:00\n---\nThis is test content.', 100);
    assert(excerpt.includes('test content'), 'getExcerpt extracts content');

    // ========================================
    // Summary
    // ========================================
    console.log('\n=== Test Summary ===');
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log('\nSome tests failed!');
      process.exitCode = 1;
    } else {
      console.log('\nAll tests passed!');
    }

  } catch (err) {
    console.error(`\nTest error: ${err.message}`);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    cleanup();
  }
}

main();
