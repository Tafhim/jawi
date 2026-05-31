import { defineConfig } from 'astro/config';
import jawi from '@jawi/core';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [jawi(), mdx()],
});
