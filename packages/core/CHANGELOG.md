# Changelog

All notable changes to @jawi/core will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- `jawi migrate slugs` — idempotent slug migration to 32-char UUIDs
- `jawi migrate time` — date-to-time migration with `--dry-run` support
- `jawi changelog` — display changelog with `--json` and `--unreleased` flags

## [1.0.0] - 2026-05-30

### Added

- **Framework extraction** — extracted core utilities, components, layouts, and pages from the monolithic Jawi site into a reusable `@jawi/core` package
- **CLI interface** — `jawi` command-line tool with commands for content creation, file management, and migrations
  - `jawi create-post` — create new blog posts with auto-generated slugs and timestamps
  - `jawi create-code` — create new code snippets with configurable title, language, and tags
  - `jawi create-thought` — create new thoughts with optional color customization
  - `jawi copy <type> <name>` — copy framework files to your project for customization
  - `jawi diff <type> <name>` — diff your overrides against framework defaults
  - `jawi changelog` — display the changelog
  - `jawi migrate <migration>` — run content migrations (slugs, time)
- **Centralized config system** — `loadConfig()` loads `jawi.config.mjs` from project root with sensible defaults
  - Site configuration (title, footer, URL)
  - Content configuration (content directory, pagination)
  - Display configuration (timezone, date format)
  - Validation for timezone (IANA) and date format presets
- **Shared utility modules** — extracted and exported reusable utilities
  - `findPosts`, `findThoughts`, `findCodes` — content discovery with frontmatter parsing
  - `parseMarkdown` — markdown-to-HTML conversion with Prism.js syntax highlighting
  - `parseFrontmatter` — YAML frontmatter extraction
  - `formatDate` — timezone-aware date formatting with multiple presets
  - `paginate` — pagination math and path generation
  - `normalizeTag` — tag normalization (strip `#`, lowercase)
  - `getAllTagsWithCounts` — merged tag cloud from posts, thoughts, and codes
  - `getExcerpt` — content excerpt generation with frontmatter stripping
  - `getFirstHeading` — extract first heading from markdown content
  - `parseThoughtColor` — thought color parsing (solid, gradient, legacy)
  - `loadPrismLanguages` — centralized Prism.js language imports
  - `generateSlug` — 32-char UUID slug generation
  - `findByTag` — find content by tag across all content types
  - `timezone` — UTC time utilities
- **Astro integration** — `@jawi/core` integration for Astro projects with automatic content collection and route generation
- **Framework components** — shared Astro components (PostCard, PostMeta, ThoughtCard, ThoughtModal, Footer, Feed)
- **Framework layouts** — MainLayout with responsive CSS and global styles
- **Framework pages** — ready-to-use page templates for posts, codes, thoughts, tags, and index

### Changed

- Replaced `import.meta.env` reads with centralized config object
- Standardized content slug format to 32-char compact UUIDs
- Replaced `date` field with `time` field (UTC timestamps) in content frontmatter
- Unified timezone handling across all date formatting utilities

### Fixed

- Fixed indentation bug in `findPosts.js` (validation was visually outside `existsSync` block)
- Fixed missing `contentHtml` data attribute on thought links in tag pages
- Fixed hardcoded footer text in `posts/index.astro` — now uses config footer value
- Fixed duplicate event handler bug in ThoughtCard caused by Astro v5 script tag behavior changes
- Fixed inconsistent `Layout` import aliases across pages
- Removed dead code: `Link.astro`, unused CSS files (`base.css`, `components.css`, `responsive.css`, `opencode.css`)
- Removed unused dependency: `@astro-community/astro-embed-link-preview`
