import { fileURLToPath } from 'url';
import { readdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { loadConfig, defaultConfig, validateConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);

/**
 * Flatten .json directories into flat .json files.
 *
 * Astro generates .json.astro routes as directories with index.html inside
 * (e.g., dist/thoughts/slug.json/index.html). Static hosts need flat .json
 * files for proper content-type and URL resolution.
 */
function flattenJsonDirs(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.json')) {
        const indexFile = join(fullPath, 'index.html');
        if (existsSync(indexFile)) {
          const content = readFileSync(indexFile, 'utf-8');
          rmSync(fullPath, { recursive: true });
          writeFileSync(join(dir, entry.name), content);
        }
      } else {
        flattenJsonDirs(fullPath);
      }
    }
  }
}

/**
 * Module-level storage for the resolved Jawi config.
 * Populated during configSetup, consumed by getJawiConfig().
 */
let resolvedConfig = null;

/**
 * Create the Astro integration.
 *
 * Usage in astro.config.mjs:
 *   import jawi from '@jawi/core';
 *   export default defineConfig({
 *     integrations: [jawi()],
 *   });
 */
export default function jawi(options = {}) {
  return {
    name: '@jawi/core',

    hooks: {
      async 'configSetup'({ config, updateConfig }) {
        // Determine the user's project root from the Astro config
        const projectRoot = config.root ? config.root.pathname || config.root : process.cwd();

        // 1. Load user config (jawi.config.mjs) and merge with defaults
        const loadedConfig = await loadConfig(projectRoot);

        // 2. Apply any options passed to jawi() integration call
        const mergedConfig = { ...loadedConfig, ...options };

        // 3. Validate the merged config
        validateConfig(mergedConfig);

        // 4. Store for getJawiConfig()
        resolvedConfig = mergedConfig;

        // 5. Inject __JAWI_CONFIG__ global for build-time config access
        updateConfig({
          viteConfig: {
            define: {
              __JAWI_CONFIG__: JSON.stringify(mergedConfig),
            },
          },
        });
      },

      'astro:build:done'({ dir }) {
        // Flatten .json directories into flat .json files for proper serving
        const distDir = dir ? dir.pathname || dir : join(process.cwd(), 'dist');
        flattenJsonDirs(distDir);
      },
    },
  };
}

/**
 * Get the resolved Jawi configuration.
 *
 * Can be imported by user pages and components:
 *   import { getJawiConfig } from '@jawi/core';
 *   const config = await getJawiConfig();
 *
 * @returns {Promise<object>} The resolved configuration object
 */
export async function getJawiConfig() {
  if (!resolvedConfig) {
    // Fallback: load config directly if called outside of configSetup
    const loadedConfig = await loadConfig(process.cwd());
    validateConfig(loadedConfig);
    resolvedConfig = loadedConfig;
  }
  return { ...resolvedConfig };
}

/**
 * Default configuration object, exported for reference.
 */
export { defaultConfig };
