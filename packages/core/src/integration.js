import { fileURLToPath } from 'url';
import { loadConfig, defaultConfig, validateConfig } from './config.js';

const __filename = fileURLToPath(import.meta.url);

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
