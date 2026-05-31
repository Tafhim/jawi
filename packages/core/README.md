# @jawi/core

Framework for the Jawi Markdown Microblog -- a serverless, static microblog built with Astro.js. Content is stored as plain Markdown files on disk. Dark terminal-inspired theme with monospace typography.

Three content types: **Posts** (long-form blog), **Codes** (syntax-highlighted snippets), and **Thoughts** (short-form notes with colored cards).

## Installation

```bash
npm install @jawi/core
```

## Quick Start

The recommended way to start a new Jawi site is with the scaffolding CLI:

```bash
npx create-jawi my-blog
cd my-blog
npm run dev
```

This creates a new project with `@jawi/core` as a dependency, a default `jawi.config.mjs`, and all necessary directory structure.

### Manual Setup

1. Create an Astro project and add `@jawi/core`:

```bash
npm create astro@latest my-blog -- --template minimal
cd my-blog
npm install @jawi/core @astrojs/mdx
```

2. Configure `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import jawi from '@jawi/core';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [jawi(), mdx()],
  site: 'https://example.com',
});
```

3. Create `jawi.config.mjs` (see Configuration below).

4. Run `npm run dev` and visit `http://localhost:4321`.

## Development

These instructions are for contributors working on the framework itself from the monorepo at `jawi-framework/`.

### Prerequisites

The framework lives in a monorepo with three packages: `@jawi/core` (framework), `create-jawi` (scaffolding CLI), and `examples/site` (reference site).

### Setup

```bash
cd /path/to/jawi/source

# Install monorepo dependencies
npm install

# Link both packages globally so the CLI binaries are available
cd packages/core && npm link
cd ../create-jawi && npm link
```

The `npm link` steps make the `jawi` and `create-jawi` CLI commands available globally. When you run `create-jawi`, it automatically detects that it is running from a local source directory and generates a `file:` reference in the site's `package.json` pointing to your local `packages/core/`. This means `npm install` in the scaffolded site resolves the framework from your source code -- no publishing required.

### Scaffold a Test Site

```bash
# Create a new test site (choose any location)
create-jawi my-blog

# Or skip npm install and do it manually
create-jawi my-blog --no-install
cd my-blog
npm install

# Start the dev server
npm run dev
```

`create-jawi` detects the local `packages/core/` directory and writes a `file:` path into the site's `package.json`. Your scaffolded site uses your source code directly -- changes to the framework are immediately reflected in the dev server.

### Making Changes and Testing

Edits to `packages/core/src/` are picked up automatically because of the symlink:

```
Edit packages/core/src/utils/formatDate.js
         |
         v (symlink)
my-blog/node_modules/@jawi/core/src/utils/formatDate.js
         |
         v
npm run dev  <-- hot-reloads immediately
```

For Astro components, layouts, and pages, the dev server watches for changes and hot-reloads. For CLI commands, they execute directly from source -- no reinstall needed:

```bash
# After editing packages/core/src/cli-commands/create-post.js
cd ~/my-blog
npx jawi create-post "test"  # uses your edited code immediately
```

### Creating Content

```bash
npx jawi create-post "tag1 tag2"
npx jawi create-code --title "Hello" --language javascript
npx jawi create-thought "random"
```

### Cleaning Up

When done testing, remove the global links:

```bash
npm unlink -g @jawi/core
npm unlink -g create-jawi
```

## Configuration

Create `jawi.config.mjs` in your project root:

```js
export default {
  site: {
    title: 'My Microblog',    // Site title (header logo + browser tab)
    footer: 'My Microblog',   // Footer text
    url: '',                  // Site URL (optional)
  },
  content: {
    dir: './content',         // Content directory root
    postsPerPage: 9,          // Items per page on feed pages
    tagsPerPage: 50,          // Items per page on tag pages
  },
  display: {
    timezone: 'UTC',          // IANA timezone or 'USER' for visitor's local timezone
    dateFormat: 'long',       // Date format preset
  },
};
```

### All Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `site.title` | `string` | `'Jawi'` | Site title displayed in header and browser tab |
| `site.footer` | `string` | `'Jawi'` | Footer text |
| `site.url` | `string` | `''` | Site base URL |
| `content.dir` | `string` | `'./content'` | Root directory for content files |
| `content.postsPerPage` | `number` | `9` | Items per page on feed/pagination |
| `content.tagsPerPage` | `number` | `50` | Items per page on tag detail pages |
| `display.timezone` | `string` | `'UTC'` | IANA timezone (e.g. `Asia/Kuala_Lumpur`) or `USER` |
| `display.dateFormat` | `string` | `'long'` | Date format preset |

### Date Format Presets

| Preset | Example Output |
|--------|---------------|
| `long` | `Monday, 26th May, 2026 at 10:12 PM` |
| `medium` | `26th May, 2026 at 10:12 PM` |
| `short` | `26 May 2026, 10:12 PM` |
| `compact` | `May 26, 2026` |
| `minimal` | `26/05/2026` |
| `iso` | `2026-05-26 22:12` |

## Utilities

All utilities are importable from `@jawi/core/utils`:

```js
import { findPosts, formatDate, normalizeTag } from '@jawi/core/utils';
```

### Content Finders

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `findPosts(baseDir?)` | `string` (default: `'./content'`) | `Promise<Post[]>` | All posts sorted by time desc |
| `findPostBySlug(slug, baseDir?)` | `string`, `string` | `Promise<Post>` | Single post by slug |
| `getPostsByTag(tag, baseDir?)` | `string`, `string` | `Promise<Post[]>` | Posts matching a tag |
| `getUniqueTags(baseDir?)` | `string` | `Promise<string[]>` | All unique post tags |
| `findThoughts(baseDir?)` | `string` | `Promise<Thought[]>` | All thoughts sorted by time desc |
| `findThoughtBySlug(slug, baseDir?)` | `string`, `string` | `Promise<Thought>` | Single thought by slug |
| `getThoughtsByTag(tag, baseDir?)` | `string`, `string` | `Promise<Thought[]>` | Thoughts matching a tag |
| `getUniqueThoughtTags(baseDir?)` | `string` | `Promise<string[]>` | All unique thought tags |
| `findCodes(baseDir?)` | `string` | `Promise<Code[]>` | All code snippets |
| `findCodeBySlug(slug, baseDir?)` | `string`, `string` | `Promise<Code>` | Single code snippet by slug |

### Tags

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `getAllUniqueTags(baseDir?)` | `string` | `Promise<string[]>` | All unique tags across all content types |
| `getItemsByTag(tag, baseDir?)` | `string`, `string` | `Promise<Item[]>` | All items (posts/thoughts/codes) for a tag |
| `getAllTagsWithCounts(baseDir?)` | `string` | `Promise<{tags, counts}>` | All tags with item counts |
| `normalizeTag(tag)` | `string` | `string` | Strip `#` prefix, lowercase |

### Formatting

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `formatDate(timeStr, preset?, config?)` | `string`, `string`, `object` | `string` | Format time string with preset |
| `formatDateClientSide(utcStr, preset)` | `string`, `string` | `string` | Client-side date formatting |
| `readTimezone(config?)` | `object` | `string` | Get timezone from config |
| `isUserTimezone(config?)` | `object` | `boolean` | Check if USER timezone mode |
| `utcNow()` | -- | `string` | Current UTC time string |
| `parseUTC(timeStr)` | `string` | `Date` | Parse UTC time string |
| `toLocalTime(utcStr, timezone?)` | `string`, `string` | `string` | Convert UTC to local time |
| `formatUTC(date)` | `Date` | `string` | Format Date as UTC string |
| `formatForDisplay(timeStr, timezone?)` | `string`, `string` | `string` | Format for display |

### Pagination

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `paginate(items, page, perPage?)` | `array`, `number`, `number` | `object` | Paginate an array |
| `generatePaginationPaths(items, perPage?)` | `array`, `number` | `array` | Astro getStaticPaths array |
| `POSTS_PER_PAGE` | -- | `9` | Default items per page constant |

### Parsing

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `parseFrontmatter(content)` | `string` | `{frontmatter, body}` | Parse YAML-like frontmatter |
| `parseMarkdown(content, filename?, codes?, config?)` | `string`, `string`, `array`, `object` | `object` | Full markdown parsing with OG fetch |
| `generateSlug(filename)` | `string` | `string` | Generate URL slug from filename |
| `getExcerpt(text, maxChars?)` | `string`, `number` | `string` | Extract text excerpt |
| `getFirstHeading(text)` | `string` | `string` | Extract first heading from markdown |
| `parseThoughtColor(value)` | `string` | `string` | Parse color field to CSS value |

### Config

| Function | Parameters | Returns | Description |
|----------|-----------|---------|-------------|
| `loadConfig(projectRoot)` | `string` | `Promise<object>` | Load jawi.config.mjs |
| `validateConfig(config)` | `object` | `boolean` | Validate config object |
| `validateTimezone(tz)` | `string` | `boolean` | Validate IANA timezone |
| `validateDateFormat(fmt)` | `string` | `boolean` | Validate date format preset |
| `defaultConfig` | -- | `object` | Default configuration values |

## Components

Framework components are available in `@jawi/core/components/*`. They are Astro components imported as:

```astro
---
import PostCard from '@jawi/core/components/PostCard.astro';
---
```

### Available Components

| Component | Props | Description |
|-----------|-------|-------------|
| `Feed.astro` | `posts`, `totalPages?`, `currentPage?`, `hasPrevious?`, `hasNext?`, `basePath?` | Post/thought card list with pagination |
| `Footer.astro` | `footerText?` | Reusable footer component |
| `Header.astro` | `siteTitle?` | Navigation bar with site links |
| `ImageCard.astro` | `image`, `alt?`, `large?`, `variant?` | Image display card |
| `PostCard.astro` | `title`, `time`, `tags`, `slug`, `compact?` | Post card (compact + full modes) |
| `PostMeta.astro` | `time` | Time + tags display |
| `TagBar.astro` | `tags` | Tag bar component |
| `ThoughtCard.astro` | `content`, `contentHtml?`, `time`, `tags`, `slug`, `color?` | Thought card with color |
| `ThoughtModal.astro` | -- | Client-side modal for thoughts |

## Pages

Framework pages are available in `@jawi/core/pages/*`. Override them by copying to your project's `src/pages/` directory.

### Available Pages

| Page | Route | Description |
|------|-------|-------------|
| `index.astro` | `/` | Homepage (two-column grid) |
| `page/[page].astro` | `/page/[N]` | Paginated mixed feed |
| `posts/index.astro` | `/posts` | Posts listing |
| `posts/page/[page].astro` | `/posts/page/[N]` | Paginated posts |
| `posts/[slug].astro` | `/posts/[slug]` | Post detail |
| `codes/index.astro` | `/codes` | Code snippets listing |
| `codes/[slug].astro` | `/codes/[slug]` | Code detail |
| `thoughts/index.astro` | `/thoughts` | Thoughts listing |
| `tags/index.astro` | `/tags` | Tag cloud |
| `tags/[tag].astro` | `/tags/[tag]` | Tag detail |
| `tags/[tag]/page/[page].astro` | `/tags/[tag]/page/[N]` | Paginated tag detail |

## CLI Commands

The `jawi` CLI is installed with `@jawi/core`. Run via `npx jawi <command>`.

### Content Creation

```bash
npx jawi create-post "tag1 tag2"           # Create a new post (prompts for title)
npx jawi create-code                       # Create a code snippet (interactive)
npx jawi create-code --title "X" --language python --tags "python"
npx jawi create-thought "tag1 tag2"        # Create a new thought
npx jawi create-thought --color solid-blue "tag1"
```

### Override Cascade

```bash
npx jawi copy page index                   # Copy framework page to your project
npx jawi copy component PostCard           # Copy framework component
npx jawi copy layout MainLayout            # Copy framework layout
npx jawi diff page index                   # Diff your override vs framework default
npx jawi copy page index --force           # Force overwrite existing override
```

### Migrations

```bash
npx jawi migrate slugs                     # Migrate slugs to 32-char UUID format
npx jawi migrate time                      # Migrate date fields to UTC datetime
npx jawi migrate time --dry-run            # Preview time migration
```

### Upgrade

```bash
npx jawi upgrade --check                   # Check for available upgrades
npx jawi upgrade --check --json            # Machine-readable output
npx jawi upgrade --refresh-manifest        # Refresh override manifest
npx jawi changelog                         # Show changelog
```

## Override Cascade

Copy any framework page, component, or layout to your project and modify it. The `jawi copy` command handles everything automatically:

```bash
npx jawi copy page index                   # Copy a framework page
npx jawi copy component PostCard           # Copy a framework component
npx jawi copy layout MainLayout            # Copy a framework layout
```

When you copy a file, three things happen:

1. **The file is copied** to `src/pages/`, `src/components/`, or `src/layouts/`
2. **Imports are rewired** -- all your pages that reference the framework version are updated to use your local copy instead
3. **Dependencies are linked** -- if your copied file references other components or layouts you have already overridden, those imports are updated to use your local copies

For example:

```bash
npx jawi copy component Footer             # Copies Footer (no pages import it directly)
npx jawi copy layout MainLayout            # Copies MainLayout, updates all pages to use it,
                                           # AND links Footer inside MainLayout to your local copy
```

After this, your local `MainLayout.astro` imports `../components/Footer.astro` (your copy) instead of `@jawi/core/components/Footer`. Components you haven't overridden (like `Header`) continue to import from the framework.

To review changes between your override and the framework default:

```bash
npx jawi diff page index
npx jawi diff component PostCard
npx jawi diff layout MainLayout
```

To reset an override to the latest framework version:

```bash
npx jawi copy page index --force
npx jawi copy component PostCard --force
npx jawi copy layout MainLayout --force
```

## Upgrading

Check for available upgrades:

```bash
npx jawi upgrade --check
```

This shows:
- Current vs latest version
- Breaking changes between versions
- User overrides that may need attention

To upgrade:

```bash
npm update @jawi/core
```

After upgrading, review any affected overrides:

```bash
npx jawi diff page index
npx jawi diff layout MainLayout
```

## Migration from .env to jawi.config.mjs

If you have an existing project using `.env` variables, migrate to `jawi.config.mjs`:

**.env (old):**
```
PUBLIC_SITE_TITLE=My Blog
PUBLIC_FOOTER_TEXT=My Blog
PUBLIC_TIMEZONE=UTC
PUBLIC_DATE_FORMAT=long
```

**jawi.config.mjs (new):**
```js
export default {
  site: {
    title: 'My Blog',
    footer: 'My Blog',
  },
  display: {
    timezone: 'UTC',
    dateFormat: 'long',
  },
};
```

The framework still supports `import.meta.env` as a fallback for backward compatibility, but `jawi.config.mjs` is the recommended approach.

## Content Structure

```
content/
  posts/          # .md/.mdx blog posts
  codes/          # .md/.mdx code snippets
  thoughts/       # .md short-form thoughts
```

### Post Frontmatter

```yaml
---
time: 2026-05-24 00:00:00
slug: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
title: My Post Title
tags:
  - "#coding"
  - "#ai"
images:
  - "/images/photo.jpg"
---
```

### Code Frontmatter

```yaml
---
time: 2026-05-24 00:00:00
title: Hello World
language: python
tags: [python, example]
---
```

### Thought Frontmatter

```yaml
---
time: 2026-05-24 00:00:00
slug: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4
color: solid-blue
tags:
  - "#random"
---
```

## License

MIT
