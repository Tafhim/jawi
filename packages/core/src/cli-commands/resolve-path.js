/**
 * Resolve a type+name pair to a framework-relative source path.
 *
 * Examples:
 *   resolveFrameworkPath('page', 'index')          -> 'src/pages/index.astro'
 *   resolveFrameworkPath('page', '[page]')          -> 'src/pages/page/[page].astro'
 *   resolveFrameworkPath('page', 'posts/[slug]')    -> 'src/pages/posts/[slug].astro'
 *   resolveFrameworkPath('component', 'PostCard')   -> 'src/components/PostCard.astro'
 *   resolveFrameworkPath('layout', 'MainLayout')    -> 'src/layouts/MainLayout.astro'
 */

const TYPE_DIR_MAP = {
  page: 'pages',
  component: 'components',
  layout: 'layouts',
};

/**
 * Resolve type+name to a framework-relative path string (e.g. "src/pages/index.astro").
 * Returns null if the type is unknown.
 */
export function resolveFrameworkPath(type, name) {
  const dir = TYPE_DIR_MAP[type];
  if (!dir) return null;
  return `src/${dir}/${name}.astro`;
}

/**
 * Return a human-readable label for a type.
 */
export function typeLabel(type) {
  const labels = { page: 'page', component: 'component', layout: 'layout' };
  return labels[type] ?? type;
}

/**
 * List all known types.
 */
export function knownTypes() {
  return Object.keys(TYPE_DIR_MAP);
}
