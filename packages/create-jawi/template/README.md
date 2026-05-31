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
npm run build                        # Build static site
npm run preview                      # Preview built site
```

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
