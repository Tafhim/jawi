/**
 * Help text for Jawi CLI
 */

export function showHelp() {
  console.log(`
Jawi CLI - @jawi/core command line interface

USAGE
  jawi <command> [args] [flags]

COMMANDS
  create-post "tags"          Create a new blog post
                              Prompts for title. Tags are space-separated.
                              Example: jawi create-post "coding ai"

  create-code                 Create a new code snippet
                              Supports --title, --language, --tags, --md flags.
                              Example: jawi create-code --title "Hello" --language python

  create-thought "tags"       Create a new thought (short-form post)
                              Supports --color flag.
                              Example: jawi create-thought --color solid-blue "random"

  copy <type> <name>          Copy a framework file to your project
                              Types: page, component, layout
                              Example: jawi copy page index
                              Use --force to overwrite existing files.

  diff <type> <name>          Show diff between your override and framework default
                              Example: jawi diff layout MainLayout

  changelog                   Show the changelog
                              Supports --json and --unreleased flags.

  migrate <migration>         Run a migration script
                              Migrations: slugs, time
                              Example: jawi migrate slugs
                              Example: jawi migrate time --dry-run

  upgrade --check             Check for available upgrades

FLAGS
  --help, -h                  Show this help message
  --version, -v               Show version
`);
}
