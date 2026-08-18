# {{SITE_TITLE}}

A Jawi microblog site.

## Quick Start

```bash
npm run dev
```

Visit http://localhost:4321.

## Commands

```bash
npm run dev                          # Start dev server
npm run build                        # Build static site (excludes drafts)
JAWI_INCLUDE_DRAFTS=true npm run build  # Build including draft content
npm run preview                      # Preview built site
npm run admin                        # Start the web admin panel
```

## Admin Panel

Manage your content from the browser:

```bash
npm run admin        # or: npx jawi admin
```

This starts a local server at `http://127.0.0.1:4322` and prints a token. Open the URL, enter the token, and you can create and edit posts, thoughts, and code snippets, manage tags and images, edit your config, and browse the trash and audit log.

The panel binds to `127.0.0.1` by default and is token-protected. All admin state (token, audit log, backups, trash) lives in `.jawi-admin/`, which is git-ignored.

## Creating Content

```bash
npx jawi create-post "tag1 tag2"     # Create a new post
npx jawi create-code                 # Create a code snippet
npx jawi create-thought "tag1 tag2"  # Create a new thought
```

## Configuration

Edit `jawi.config.mjs` to customize your site:

- `site.title` - Site title shown in header and browser tab
- `site.footer` - Footer text
- `content.dir` - Content directory (default: `./content`)
- `content.postsPerPage` - Posts per page (default: 9)
- `display.timezone` - Timezone for dates (default: `UTC`, or `USER` for visitor's timezone)
- `display.dateFormat` - Date format preset (default: `long`)

## Deployment

Copy `.env.example` to `.env` and set your environment variables:

```bash
cp .env.example .env
```

See the [Jawi documentation](https://github.com/jawi-framework) for deployment guides.
