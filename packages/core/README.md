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

### Example Scenario: Overriding a Component Imported by a Layout

A common situation: you want to customise `Header.astro` (e.g. change the navigation links). You create your own version at `src/components/Header.astro`, but after rebuilding, the site still shows the default Header.

**Why this happens:** `Header` is not imported by pages directly -- it is imported by `MainLayout.astro`, which lives inside the framework package and uses a hardcoded alias import:

```astro
<!-- Inside @jawi/core/src/layouts/MainLayout.astro -->
import Header from '@jawi/core/components/Header';
```

This alias resolves to the framework's own `Header.astro`. Your local `src/components/Header.astro` is never referenced. Simply placing a file in `src/components/` is not enough -- the import chain must be rewired.

**The fix -- use the cascade in the right order:**

```bash
# Step 1: Create or place your custom Header.astro in src/components/
# (You may have already done this)

# Step 2: Copy MainLayout -- this does three things:
#   a) Copies MainLayout.astro to src/layouts/
#   b) Rewires all your pages to import your local MainLayout
#   c) Detects your existing src/components/Header.astro and updates
#      the import inside MainLayout to point to your local copy
npx jawi copy layout MainLayout
```

After this, your local `MainLayout.astro` imports `../components/Header.astro` (your custom version) instead of `@jawi/core/components/Header`. Rebuild and your changes appear.

**Key rule:** If the thing you want to override is imported by a layout or another component you haven't copied yet, copy the parent first. The cascade only rewires imports in files that exist in your project.

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

## Emoji Support

Use emoji shortcodes in your markdown content with `:shortcode:` syntax. They are automatically converted to Unicode emoji characters during build.

```markdown
I love coding :rocket: :heart:
This feature is :fire: and :100:
```

Shortcodes are case-insensitive (`:Smile:` and `:smile:` both work).

### Supported Emojis

**Smileys & Emotion**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:grinning:` | | `:smiley:` | | `:smile:` | |
| `:grin:` | | `:laughing:` | | `:sweat_smile:` | |
| `:rofl:` | | `:joy:` | | `:wink:` | |
| `:blush:` | | `:innocent:` | | `:heart_eyes:` | |
| `:kissing_heart:` | | `:kissing:` | | `:kissing_smiling_eyes:` | |
| `:kissing_closed_eyes:` | | `:yum:` | | `:stuck_out_tongue:` | |
| `:stuck_out_tongue_winking_eye:` | | `:stuck_out_tongue_closed_eyes:` | | `:money_mouth:` | |
| `:hugging:` | | `:thinking:` | | `:shy:` | |
| `:relieved:` | | `:pensive:` | | `:sleeping:` | |
| `:mask:` | | `:nauseated:` | | `:sneezing:` | |
| `:dizzy:` | | `:cool:` | | `:sunglasses:` | |
| `:nerd:` | | `:clown:` | | `:crying_cat_face:` | |
| `:scream:` | | `:open_mouth:` | | `:hushed:` | |
| `:astonished:` | | `:flushed:` | | `:dazed:` | |
| `:disappointed_relieved:` | | `:cry:` | | `:sob:` | |
| `:frowning:` | | `:anguished:` | | `:weary:` | |
| `:tired_face:` | | `:sleepy:` | | `:frowning_face:` | |
| `:no_mouth:` | | `:neutral_face:` | | `:expressionless:` | |
| `:unamused:` | | `:roll_eyes:` | | `:grimacing:` | |
| `:lying_face:` | | `:smirk:` | | `:confounded:` | |
| `:upsidedown_face:` | | `:zip_mouth:` | | `:raised_eyebrow:` | |
| `:face_with_hand_over_mouth:` | | `:face_with_symbols_over_mouth:` | | `:exploding_head:` | |
| `:face_with_thermometer:` | | `:face_with_head_bandage:` | | `:monocle:` | |

**Gestures & Hands**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:thumbsup:` | | `:thumbsdown:` | | `:clap:` | |
| `:wave:` | | `:raised_hands:` | | `:open_hands:` | |
| `:palms_up:` | | `:handshake:` | | `:pray:` | |
| `:flexed_biceps:` | | `:muscle:` | | `:fist:` | |
| `:fist_raised:` | | `:fist_oncoming:` | | `:crossed_fingers:` | |
| `:vulcan_salute:` | | `:pinching_hand:` | | `:point_up:` | |
| `:point_up_2:` | | `:point_down:` | | `:point_left:` | |
| `:point_right:` | | `:middle_finger:` | | `:ok_hand:` | |
| `:pinch:` | | `:raised_back_of_hand:` | | `:love_you:` | |
| `:sign_of_the_horns:` | | `:call_me:` | | `:nail_care:` | |
| `:selfie:` | | `:writing_hand:` | | | |

**Hearts & Symbols**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:heart:` | | `:red_heart:` | | `:orange_heart:` | |
| `:yellow_heart:` | | `:green_heart:` | | `:blue_heart:` | |
| `:purple_heart:` | | `:black_heart:` | | `:white_heart:` | |
| `:brown_heart:` | | `:broken_heart:` | | `:heart_exclamation:` | |
| `:two_hearts:` | | `:revolving_hearts:` | | `:heartbeat:` | |
| `:heart_pulse:` | | `:sparkling_heart:` | | `:growing_heart:` | |
| `:check:` | | `:x:` | | `:question:` | |
| `:grey_question:` | | `:grey_exclamation:` | | `:exclamation:` | |
| `:bangbang:` | | `:interrobang:` | | `:curly_loop:` | |
| `:loop:` | | `:part_alternation_mark:` | | `:eight_spoked_asterisk:` | |
| `:negative_squared_cross_mark:` | | `:sparkles:` | | `:star:` | |
| `:stars:` | | `:shining_star:` | | `:dizzy:` | |
| `:fire:` | | `:flame:` | | `:lightning:` | |
| `:zap:` | | `:cloud:` | | `:partly_sunny:` | |
| `:sun_behind_cloud:` | | `:cloud_with_rain:` | | `:cloud_with_lightning:` | |
| `:tornado:` | | `:fog:` | | `:umbrella:` | |
| `:snowflake:` | | `:snowman:` | | `:snowman_with_snow:` | |
| `:wind_face:` | | `:cyclone:` | | `:rainbow:` | |
| `:sun:` | | `:moon:` | | `:new_moon:` | |
| `:waxing_crescent_moon:` | | `:first_quarter_moon:` | | `:waxing_gibbous_moon:` | |
| `:full_moon:` | | `:waning_gibbous_moon:` | | `:last_quarter_moon:` | |
| `:waning_crescent_moon:` | | `:crescent_moon:` | | `:new_moon_face:` | |
| `:first_quarter_moon_face:` | | `:last_quarter_moon_face:` | | `:thermometer:` | |
| `:copyright:` | | `:registered:` | | `:trademark:` | |
| `:id:` | | `:atom:` | | `:om:` | |
| `:star_of_david:` | | `:wheel_of_dharma:` | | `:yin_yang:` | |
| `:latin_cross:` | | `:orthodox_cross:` | | `:star_and_crescent:` | |
| `:peace:` | | `:menorah:` | | `:six_pointed_star:` | |
| `:shinto_shrine:` | | `:church:` | | `:mosque:` | |
| `:synagogue:` | | `:kaaba:` | | | |

**Zodiac**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:aries:` | | `:taurus:` | | `:gemini:` | |
| `:cancer:` | | `:leo:` | | `:virgo:` | |
| `:libra:` | | `:scorpius:` | | `:sagittarius:` | |
| `:capricorn:` | | `:aquarius:` | | `:pisces:` | |
| `:ophiuchus:` | | | | | |

**Animals**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:dog:` | | `:cat:` | | `:mouse:` | |
| `:hamster:` | | `:rabbit:` | | `:fox:` | |
| `:bear:` | | `:panda:` | | `:koala:` | |
| `:tiger:` | | `:lion:` | | `:cow:` | |
| `:pig:` | | `:pig_nose:` | | `:frog:` | |
| `:monkey:` | | `:see_no_evil:` | | `:hear_no_evil:` | |
| `:speak_no_evil:` | | `:chicken:` | | `:penguin:` | |
| `:bird:` | | `:baby_chick:` | | `:hatching_chick:` | |
| `:hatched_chick:` | | `:duck:` | | `:eagle:` | |
| `:owl:` | | `:bat:` | | `:wolf:` | |
| `:boar:` | | `:turtle:` | | `:lizard:` | |
| `:snake:` | | `:dragon:` | | `:dragon_face:` | |
| `:whale:` | | `:whale2:` | | `:dolphin:` | |
| `:fish:` | | `:tropical_fish:` | | `:blowfish:` | |
| `:crocodile:` | | `:leopard:` | | `:tiger2:` | |
| `:water_buffalo:` | | `:ox:` | | `:cow2:` | |
| `:dromedary_camel:` | | `:camel:` | | `:elephant:` | |
| `:rhinoceros:` | | `:gorilla:` | | `:racehorse:` | |
| `:pig2:` | | `:goat:` | | `:ram:` | |
| `:sheep:` | | `:monkey_face:` | | `:gibbon:` | |
| `:feet:` | | `:paw_prints:` | | `:bug:` | |
| `:ant:` | | `:bee:` | | `:honeybee:` | |
| `:beetle:` | | `:lady_beetle:` | | `:cricket:` | |
| `:butterfly:` | | `:snail:` | | `:spider:` | |
| `:scorpion:` | | `:mosquito:` | | `:microbe:` | |

**Food & Drink**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:pizza:` | | `:burger:` | | `:fries:` | |
| `:hotdog:` | | `:chicken_leg:` | | `:popcorn:` | |
| `:doughnut:` | | `:cookie:` | | `:bread:` | |
| `:croissant:` | | `:baguette_bread:` | | `:pretzel:` | |
| `:bagel:` | | `:cheese:` | | `:egg:` | |
| `:cooking:` | | `:pancakes:` | | `:waffle:` | |
| `:bacon:` | | `:steak:` | | `:poultry_leg:` | |
| `:meat_on_bone:` | | `:cut_of_meat:` | | `:sandwich:` | |
| `:canned_food:` | | `:hamburger:` | | `:fried_shrimp:` | |
| `:curry:` | | `:sushi:` | | `:bento:` | |
| `:ramen:` | | `:spaghetti:` | | `:shrimp:` | |
| `:crab:` | | `:oyster:` | | `:ice_cream:` | |
| `:icecream:` | | `:cake:` | | `:birthday:` | |
| `:christmas_tree:` | | `:candy:` | | `:lollipop:` | |
| `:custard:` | | `:honey_pot:` | | `:milk:` | |
| `:coffee:` | | `:tea:` | | `:sake:` | |
| `:champagne:` | | `:wine_glass:` | | `:cocktail:` | |
| `:tropical_drink:` | | `:beer:` | | `:beers:` | |
| `:champagne_glass:` | | `:tumbler_glass:` | | `:cup_with_straw:` | |
| `:bubble_tea:` | | `:apple:` | | `:green_apple:` | |
| `:lemon:` | | `:lime:` | | `:tangerine:` | |
| `:banana:` | | `:watermelon:` | | `:grapes:` | |
| `:strawberry:` | | `:melon:` | | `:cherries:` | |
| `:peach:` | | `:mango:` | | `:pineapple:` | |
| `:coconut:` | | `:kiwi:` | | `:avocado:` | |
| `:tomato:` | | `:eggplant:` | | `:broccoli:` | |
| `:leafy_green:` | | `:carrot:` | | `:corn:` | |
| `:hot_pepper:` | | `:mushroom:` | | `:potato:` | |
| `:sweet_potato:` | | `:peanuts:` | | `:ginger:` | |
| `:pea:` | | | | | |

**Nature**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:bouquet:` | | `:cherry_blossom:` | | `:white_flower:` | |
| `:rosette:` | | `:rose:` | | `:wilted_flower:` | |
| `:hibiscus:` | | `:sunflower:` | | `:blossom:` | |
| `:tulip:` | | `:seedling:` | | `:potted_plant:` | |
| `:evergreen_tree:` | | `:deciduous_tree:` | | `:palm_tree:` | |
| `:cactus:` | | `:herb:` | | `:shamrock:` | |
| `:four_leaf_clover:` | | `:maple_leaf:` | | `:fallen_leaf:` | |
| `:leaves:` | | `:ear_of_rice:` | | `:moss:` | |
| `:rock:` | | `:hologram:` | | `:hole:` | |
| `:droplet:` | | `:sweat_drops:` | | `:umbrella:` | |
| `:globe_showing_europe_africa:` | | `:globe_showing_americas:` | | `:globe_showing_asia_australia:` | |
| `:earth_africa:` | | `:earth_americas:` | | `:earth_asia:` | |
| `:volcano:` | | `:mountain:` | | `:mountain_snow:` | |
| `:sunrise:` | | `:sunrise_over_mountains:` | | `:desert:` | |
| `:desert_island:` | | `:beach_umbrella:` | | `:beach:` | |
| `:ocean:` | | `:waterfall:` | | `:hot_springs:` | |
| `:house:` | | `:house_with_garden:` | | `:houses:` | |
| `:derelict_house:` | | `:school:` | | `:office:` | |
| `:post_office:` | | `:european_post_office:` | | `:hospital:` | |
| `:bank:` | | `:hotel:` | | `:love_hotel:` | |
| `:convenience_store:` | | `:department_store:` | | `:european_castle:` | |
| `:japanese_castle:` | | `:stadium:` | | `:classical_building:` | |
| `:building_construction:` | | `:brick:` | | `:rock:` | |
| `:wood:` | | `:hut:` | | `:church:` | |
| `:mosque:` | | `:hindu_temple:` | | `:synagogue:` | |
| `:shinto_shrine:` | | `:kaaba:` | | `:fountain:` | |
| `:tokyo_tower:` | | `:statue_of_liberty:` | | `:foggy:` | |
| `:night_with_stars:` | | `:city_sunset:` | | `:city_sunrise:` | |
| `:city_dusk:` | | `:cityscape:` | | `:milky_way:` | |
| `:bridge_at_night:` | | `:rainbow:` | | `:comet:` | |
| `:satellite:` | | `:new_moon:` | | `:waxing_crescent_moon:` | |
| `:first_quarter_moon:` | | `:waxing_gibbous_moon:` | | `:full_moon:` | |
| `:waning_gibbous_moon:` | | `:last_quarter_moon:` | | `:waning_crescent_moon:` | |
| `:crescent_moon:` | | `:new_moon_face:` | | `:first_quarter_moon_face:` | |
| `:last_quarter_moon_face:` | | `:thermometer:` | | `:thermometer_face:` | |
| `:thermometer_high:` | | `:thermometer_low:` | | `:umbrella_with_rain_drops:` | |
| `:cloud_with_rain:` | | `:cloud_with_snow:` | | `:cloud_with_lightning:` | |
| `:cloud_with_tornado:` | | `:high_voltage:` | | `:snowman_without_snow:` | |
| `:sun_behind_small_cloud:` | | `:sun_behind_large_cloud:` | | `:sun_behind_rain_cloud:` | |
| `:cloud_with_rain:` | | `:cloud_with_snow:` | | `:cloud_with_lightning:` | |
| `:cloud_with_tornado:` | | `:fog:` | | `:wind_face:` | |
| `:cyclone:` | | `:rainbow:` | | `:closed_umbrella:` | |

**Activities & Sports**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:soccer:` | | `:basketball:` | | `:football:` | |
| `:baseball:` | | `:softball:` | | `:tennis:` | |
| `:volleyball:` | | `:rugby_football:` | | `:flying_disc:` | |
| `:8ball:` | | `:golf:` | | `:golfing:` | |
| `:bowling:` | | `:fishing_pole_and_fish:` | | `:running_shirt_with_sash:` | |
| `:ski:` | | `:skier:` | | `:snowboarder:` | |
| `:ice_skate:` | | `:curling_stone:` | | `:sled:` | |
| `:dart:` | | `:yo_yo:` | | `:kite:` | |
| `:bullseye:` | | `:pool_8_ball:` | | `:cricket_game:` | |
| `:field_hockey:` | | `:ice_hockey:` | | `:lacrosse:` | |
| `:squash_racquet_and_ball:` | | `:ringed_planet:` | | `:trophy:` | |
| `:medal_sports:` | | `:first_place_medal:` | | `:second_place_medal:` | |
| `:third_place_medal:` | | `:rosette:` | | `:reminder_ribbon:` | |
| `:ticket:` | | `:tickets:` | | `:performing_arts:` | |
| `:art:` | | `:microphone:` | | `:headphones:` | |
| `:musical_score:` | | `:musical_note:` | | `:notes:` | |
| `:saxophone:` | | `:accordion:` | | `:guitar:` | |
| `:musical_keyboard:` | | `:trumpet:` | | `:violin:` | |
| `:banjo:` | | `:drum:` | | `:long_drum:` | |
| `:game_die:` | | `:chess_pawn:` | | `:jigsaw:` | |
| `:video_game:` | | `:slot_machine:` | | `:automation:` | |
| `:robot:` | | | | | |

**Travel & Places**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:red_car:` | | `:taxi:` | | `:blue_car:` | |
| `:bus:` | | `:trolleybus:` | | `:race_car:` | |
| `:police_car:` | | `:ambulance:` | | `:fire_engine:` | |
| `:minibus:` | | `:truck:` | | `:articulated_lorry:` | |
| `:tractor:` | | `:motorcycle:` | | `:racing_motorcycle:` | |
| `:bicycle:` | | `:kick_scooter:` | | `:skateboard:` | |
| `:roller_skate:` | | `:busstop:` | | `:motorway:` | |
| `:railway:` | | `:station:` | | `:airplane:` | |
| `:small_airplane:` | | `:flight_departure:` | | `:flight_arrival:` | |
| `:sailboat:` | | `:speedboat:` | | `:motor_boat:` | |
| `:cruise_ship:` | | `:rocket:` | | `:satellite:` | |
| `:seat:` | | `:anchor:` | | `:canoe:` | |
| `:rowboat:` | | `:pedal:` | | `:helicopter:` | |
| `:suspension_railway:` | | `:mountain_railway:` | | `:monorail:` | |
| `:railway_car:` | | `:train:` | | `:mountain_cableway:` | |
| `:aerial_tramway:` | | `:shipping:` | | `:fork_and_knife:` | |
| `:bellhop_bell:` | | `:door:` | | `:couch:` | |
| `:bed:` | | `:sleeping_accommodation:` | | `:toilet:` | |
| `:shower:` | | `:bathtub:` | | `:clock:` | |
| `:watch:` | | `:hourglass:` | | `:hourglass_flowing_sand:` | |
| `:stopwatch:` | | `:timer:` | | `:alarm_clock:` | |
| `:mantelpiece_clock:` | | `:compass:` | | `:map:` | |
| `:world_map:` | | `:compass:` | | `:luggage:` | |
| `:briefcase:` | | `:backpack:` | | `:passport_control:` | |
| `:customs:` | | `:baggage_claim:` | | `:left_luggage:` | |

**Objects**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:watch:` | | `:iphone:` | | `:calling:` | |
| `:computer:` | | `:keyboard:` | | `:computer_mouse:` | |
| `:trackball:` | | `:printer:` | | `:mouse_three_button:` | |
| `:joystick:` | | `:clamp:` | | `:minidisc:` | |
| `:floppy_disk:` | | `:cd:` | | `:dvd:` | |
| `:abacus:` | | `:film_projector:` | | `:film_frames:` | |
| `:camera:` | | `:camera_with_flash:` | | `:video_camera:` | |
| `:vhs:` | | `:tv:` | | `:radio:` | |
| `:studio_microphone:` | | `:level_slider:` | | `:control_knobs:` | |
| `:microphone:` | | `:headphones:` | | `:broadcast:` | |
| `:personal_computer:` | | `:laptop:` | | `:desktop:` | |
| `:printer:` | | `:optical_disk:` | | `:dvd:` | |
| `:abacus:` | | `:film_projector:` | | `:clapper:` | |
| `:tv:` | | `:camera:` | | `:video_camera:` | |
| `:movie_camera:` | | `:film_strip:` | | `:telephone:` | |
| `:telephone_receiver:` | | `:pager:` | | `:satellite_antenna:` | |
| `:battery:` | | `:electric_plug:` | | `:bulb:` | |
| `:flashlight:` | | `:candle:` | | `:fire_extinguisher:` | |
| `:bucket:` | | `:broom:` | | `:basket:` | |
| `:roll_of_paper:` | | `:toilet:` | | `:shower:` | |
| `:bathtub:` | | `:mouse:` | | `:notebook:` | |
| `:ledger:` | | `:notebook_with_decorative_cover:` | | `:closed_book:` | |
| `:book:` | | `:green_book:` | | `:blue_book:` | |
| `:orange_book:` | | `:books:` | | `:bookmark:` | |
| `:label:` | | `:bookmark_tabs:` | | `:card_index:` | |
| `:chart:` | | `:chart_with_upwards_trend:` | | `:chart_with_downwards_trend:` | |
| `:bar_chart:` | | `:clipboard:` | | `:calendar:` | |
| `:date:` | | `:wrench:` | | `:hammer:` | |
| `:hammer_and_wrench:` | | `:pick:` | | `:hammer_and_pick:` | |
| `:tools:` | | `:screwdriver:` | | `:nut_and_bolt:` | |
| `:gear:` | | `:link:` | | `:chains:` | |
| `:magnet:` | | `:gun:` | | `:bow_and_arrow:` | |
| `:shield:` | | `:dagger:` | | `:crossed_swords:` | |
| `:smoking:` | | `:skull_and_crossbones:` | | `:coffin:` | |
| `:funeral_urn:` | | `:moyai:` | | `:prayer_beads:` | |
| `:nazar_amulet:` | | `:barber:` | | `:alembic:` | |
| `:test_tube:` | | `:petri_dish:` | | `:dna:` | |
| `:microscope:` | | `:telescope:` | | `:satellite:` | |
| `:pill:` | | `:syringe:` | | `:drop_of_blood:` | |
| `:bandage:` | | `:stethoscope:` | | `:x_ray:` | |
| `:door:` | | `:elevator:` | | `:mirror:` | |
| `:window:` | | `:bed:` | | `:couch:` | |
| `:toilet:` | | `:shower:` | | `:bathtub:` | |
| `:mouse_trap:` | | `:razor:` | | `:lotion_bottle:` | |
| `:safety_pin:` | | `:broom:` | | `:basket:` | |
| `:toilet_paper:` | | `:keys:` | | `:old_key:` | |
| `:moneybag:` | | `:coin:` | | `:yen:` | |
| `:dollar:` | | `:euro:` | | `:pound:` | |
| `:money_with_wings:` | | `:credit_card:` | | `:receipt:` | |
| `:chart:` | | `:gem:` | | `:scales:` | |
| `:package:` | | `:box:` | | `:mailbox:` | |
| `:envelope:` | | `:inbox_tray:` | | `:outbox_tray:` | |
| `:paperclip:` | | `:paperclips:` | | `:straight_ruler:` | |
| `:triangular_ruler:` | | `:scissors:` | | `:card_index:` | |
| `:file_cabinet:` | | `:wastebasket:` | | `:lock:` | |
| `:unlock:` | | `:lock_with_ink_pen:` | | `:closed_lock_with_key:` | |
| `:key:` | | `:mailbox_closed:` | | `:mailbox_with_mail:` | |
| `:mailbox_with_no_mail:` | | `:postbox:` | | `:ballot_box:` | |
| `:horn:` | | `:email:` | | `:envelope_with_arrow:` | |
| `:incoming_envelope:` | | `:postal_horn:` | | `:inbox_tray:` | |
| `:package:` | | `:mailbox:` | | `:mailbox_closed:` | |
| `:mailbox_with_mail:` | | `:mailbox_with_no_mail:` | | `:postbox:` | |
| `:ballot_box:` | | `:horn:` | | `:email:` | |
| `:envelope_with_arrow:` | | `:incoming_envelope:` | | `:postal_horn:` | |

**People & Body**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:person_facepalming:` | | `:person_shrugging:` | | `:man:` | |
| `:woman:` | | `:baby:` | | `:older_adult:` | |
| `:person:` | | `:princess:` | | `:prince:` | |
| `:santa:` | | `:mrs_claus:` | | `:superhero:` | |
| `:supervillain:` | | `:detective:` | | `:ninja:` | |
| `:judge:` | | `:farmer:` | | `:cook:` | |
| `:mechanic:` | | `:factory_worker:` | | `:teacher:` | |
| `:singer:` | | `:artist:` | | `:pilot:` | |
| `:astronaut:` | | `:police_officer:` | | `:soldier:` | |
| `:construction_worker:` | | `:guard:` | | `:health_worker:` | |
| `:firefighter:` | | `:person_tipping_hand:` | | `:person_gesturing_ok:` | |
| `:person_bowing:` | | `:person_raising_hand:` | | `:person_frowning:` | |
| `:person_gesturing_no:` | | `:person_standing:` | | `:person_kneeling:` | |
| `:person_running:` | | `:person_walking:` | | `:person_in_lotus_position:` | |
| `:person_climbing:` | | `:person_in_steamy_room:` | | `:person_swimming:` | |
| `:person_bouncing_ball:` | | `:person_lifting_weights:` | | `:person_biking:` | |
| `:person_mountain_biking:` | | `:person_rowing:` | | `:person_surfing:` | |
| `:person_playing_handball:` | | `:person_juggling:` | | `:dancer:` | |
| `:man_dancing:` | | `:business_suit_levitating:` | | `:people_with_bunny_ears:` | |
| `:person_with_pouting_face:` | | `:person_facepalming:` | | | |

**Miscellaneous**

| Code | Emoji | Code | Emoji | Code | Emoji |
|------|-------|------|-------|------|-------|
| `:smiley_cat:` | | `:smile_cat:` | | `:joy_cat:` | |
| `:heart_eyes_cat:` | | `:smiling_imp:` | | `:imp:` | |
| `:japanese_ogre:` | | `:japanese_goblin:` | | `:hankey:` | |
| `:turd:` | | `:poop:` | | `:skull:` | |
| `:skull_and_crossbones:` | | `:ghost:` | | `:alien:` | |
| `:space_invader:` | | `:robot:` | | `:jack_o_lantern:` | |
| `:shushing_face:` | | `:face_with_symbols_over_mouth:` | | `:anger_symbol:` | |
| `:bomb:` | | `:zzz:` | | `:speech_balloon:` | |
| `:eye_speech_bubble:` | | `:left_speech_bubble:` | | `:right_anger_bubble:` | |
| `:thought_balloon:` | | `:kiss:` | | `:love_letter:` | |
| `:couple:` | | `:two_men_holding_hands:` | | `:two_women_holding_hands:` | |
| `:family:` | | `:family_man_woman_girl:` | | `:family_man_woman_boy:` | |
| `:family_man_woman_girl_boy:` | | `:family_man_boy:` | | `:family_man_boys:` | |
| `:family_woman_girl:` | | `:family_woman_boy:` | | `:family_woman_girl_boy:` | |
| `:family_woman_girls:` | | `:family_woman_boys:` | | `:family_man_man_boy:` | |
| `:family_man_man_girl:` | | `:family_man_man_girl_boy:` | | `:family_man_man_girls:` | |
| `:family_man_man_boys:` | | `:family_woman_woman_girl:` | | `:family_woman_woman_boy:` | |
| `:family_woman_woman_girl_boy:` | | `:family_woman_woman_girls:` | | `:family_woman_woman_boys:` | |
| `:crying_face:` | | `:angry:` | | `:rage:` | |
| `:explosion:` | | `:boom:` | | `:collision:` | |
| `:sweat_drops:` | | `:dash:` | | `:dizzy_symbol:` | |
| `:ribbon:` | | `:gift:` | | `:reminder_ribbon:` | |
| `:medals_military:` | | `:medal_military:` | | `:medal_sports:` | |
| `:rosette:` | | `:ticket:` | | `:admission_tickets:` | |
| `:performing_arts:` | | `:art:` | | `:circus_tent:` | |
| `:artist_palette:` | | `:thread:` | | `:sewing_needle:` | |
| `:yarn:` | | `:knitting_needles:` | | `:ring:` | |
| `:gem:` | | `:m:` | | `:copyright:` | |
| `:registered:` | | `:trademark:` | | `:id:` | |
| `:atom:` | | `:om:` | | `:star_of_david:` | |
| `:wheel_of_dharma:` | | `:yin_yang:` | | `:latin_cross:` | |
| `:orthodox_cross:` | | `:star_and_crescent:` | | `:peace:` | |
| `:menorah:` | | `:six_pointed_star:` | | `:aries:` | |
| `:taurus:` | | `:gemini:` | | `:cancer:` | |
| `:leo:` | | `:virgo:` | | `:libra:` | |
| `:scorpius:` | | `:sagittarius:` | | `:capricorn:` | |
| `:aquarius:` | | `:pisces:` | | `:ophiuchus:` | |
| `:shinto_shrine:` | | `:church:` | | `:mosque:` | |
| `:synagogue:` | | `:kaaba:` | | `:frowning:` | |
| `:persevere:` | | `:confused:` | | `:slightly_frowning_face:` | |
| `:no_good:` | | `:ok_woman:` | | `:information_desk_person:` | |
| `:raising_hand:` | | `:bow:` | | `:see_no_evil:` | |
| `:hear_no_evil:` | | `:speak_no_evil:` | | `:kiss:` | |
| `:love_letter:` | | `:couple:` | | `:two_men_holding_hands:` | |
| `:two_women_holding_hands:` | | `:family:` | | `:family_man_woman_girl:` | |
| `:family_man_woman_boy:` | | `:family_man_woman_girl_boy:` | | `:family_man_boy:` | |
| `:family_man_boys:` | | `:family_woman_girl:` | | `:family_woman_boy:` | |
| `:family_woman_girl_boy:` | | `:family_woman_girls:` | | `:family_woman_boys:` | |
| `:family_man_man_boy:` | | `:family_man_man_girl:` | | `:family_man_man_girl_boy:` | |
| `:family_man_man_girls:` | | `:family_man_man_boys:` | | `:family_woman_woman_girl:` | |
| `:family_woman_woman_boy:` | | `:family_woman_woman_girl_boy:` | | `:family_woman_woman_girls:` | |
| `:family_woman_woman_boys:` | | | | | |

### Extending the Emoji Map

The emoji mapping lives in `packages/core/src/utils/emoji.js`. To add more emojis:

1. Open `emoji.js` and add entries to the appropriate category object (e.g., `smileys`, `animals`, etc.)
2. Each entry maps a shortcode name (lowercase, underscore-separated) to a Unicode character
3. The `EMOJI_MAP` export is automatically built from all category objects

```js
// Example: add a new emoji to the smileys category
const smileys = {
  // ... existing entries ...
  my_custom_emoji: '\u{1F600}',  // shortcode :my_custom_emoji:
};
```

You can also import `EMOJI_MAP` and `convertEmojis` from `@jawi/core/utils` for programmatic use.

## License

MIT
