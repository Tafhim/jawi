#!/usr/bin/env node
/**
 * Jawi CLI - Command line interface for @jawi/core
 *
 * Usage: jawi <command> [args] [flags]
 *
 * Commands:
 *   create-post "tags"          Create a new blog post
 *   create-code                 Create a new code snippet
 *   create-thought "tags"       Create a new thought
 *   copy <type> <name>          Copy a framework file to your project
 *   diff <type> <name>          Diff your override against framework default
 *   changelog                   Show changelog
 *   migrate <migration>         Run a migration (slugs, time)
 *   upgrade                     Check for upgrades
 *   --help                      Show this help
 *   --version                   Show version
 */

import { createRequire } from 'module';
import { showHelp } from './cli-commands/help.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

function main() {
  const args = process.argv.slice(2);

  // Global flags
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return Promise.resolve();
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`@jawi/core v${version}`);
    return Promise.resolve();
  }

  if (args.length === 0) {
    showHelp();
    return Promise.resolve();
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  // Command dispatch
  switch (command) {
    case 'create-post':
      return import('./cli-commands/create-post.js').then(m => m.createPost(commandArgs));
    case 'create-code':
      return import('./cli-commands/create-code.js').then(m => m.createCode(commandArgs));
    case 'create-thought':
      return import('./cli-commands/create-thought.js').then(m => m.createThought(commandArgs));
    case 'copy':
      return import('./cli-commands/copy.js').then(m => m.copy(commandArgs));
    case 'diff':
      return import('./cli-commands/diff.js').then(m => m.diff(commandArgs));
    case 'changelog':
      return import('./cli-commands/changelog.js').then(m => m.changelog(commandArgs));
    case 'migrate':
      return import('./cli-commands/migrate.js').then(m => m.migrate(commandArgs));
    case 'upgrade':
      return import('./cli-commands/upgrade.js').then(m => m.upgrade(commandArgs));
    default:
      console.error(`Unknown command: ${command}`);
      console.error('Run "jawi --help" for usage information.');
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
