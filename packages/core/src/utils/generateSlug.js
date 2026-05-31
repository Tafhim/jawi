/**
 * Generate URL slug from markdown filename
 * 
 * Rules:
 * - Remove .md extension
 * - Replace spaces with hyphens
 * - Remove special characters (except hyphens)
 * - Preserve date format in filename
 * 
 * @param {string} filename - The markdown file name (e.g., '2026-04-20-politics.md')
 * @returns {string} - URL slug (e.g., '2026-04-20-politics')
 */

function generateSlug(filename) {
  // Remove .md or .mdx extension
  let slug = filename.replace(/\.(mdx?)$/, '');
  
  // Replace spaces with hyphens
  slug = slug.replace(/ /g, '-');
  
  // Remove special characters (except hyphens and alphanumeric)
  slug = slug.replace(/[^a-zA-Z0-9-]/g, '');
  
  // Ensure slug starts with hyphen, remove leading/trailing hyphens
  slug = slug.replace(/^-+|-+$/g, '');
  
  // Convert to lowercase
  slug = slug.toLowerCase();
  
  // Ensure slug is not empty
  if (!slug) {
    return 'untitled';
  }
  
  return slug;
}

export { generateSlug };