# Jawi Framework

A serverless, static microblog framework built with Astro.js.

## Breaking change (2026-06-21)

**Thought permalink modal missing background color.**

Sites with a local copy of `src/pages/thoughts/[slug].json.astro` (created by `create-jawi` or `jawi copy`) are missing the `gradient` field in the JSON response. Thought permalinks (`/?thought=<slug>`) open the modal with the default dark background instead of the thought's color.

**Fix -- add 3 lines to `src/pages/thoughts/[slug].json.astro`:**

```js
// 1. Add import (with other imports at top)
import { parseThoughtColor } from '@jawi/core/utils/parseThoughtColor';

// 2. Compute gradient (after loading thought prop)
const gradient = parseThoughtColor(thought.color);

// 3. Include in JSON response
return new Response(JSON.stringify({
  // ... existing fields ...
  gradient,
}), { headers: { 'Content-Type': 'application/json' } });
```

Or reset the override to the latest framework version:

```bash
npx jawi copy page thoughts/[slug].json --force
```

Then rebuild the site.

## Packages

- **@jawi/core** - Core framework with utilities, components, layouts, pages, and CLI
- **create-jawi** - Scaffolding CLI for new Jawi sites

## Getting Started

```bash
npx create-jawi my-blog
cd my-blog
npm run dev
```

## Features

- **Three content types** — posts, code snippets, and colored thoughts, all plain Markdown on disk.
- **Serverless & static** — builds to static HTML with Astro; no backend required to serve.
- **Admin panel** — a local web UI to create, edit, and manage content from the browser:

  ```bash
  npx jawi admin        # or: npm run admin
  ```

  Binds to `127.0.0.1` by default and is protected by a token. See the core README for details.
- **Override cascade** — copy any framework page, component, or layout into your project and customise it.
- **Migrations & upgrades** — tooling to evolve your content and overrides safely.

## Documentation

See [packages/core/README.md](packages/core/README.md) for full documentation.
