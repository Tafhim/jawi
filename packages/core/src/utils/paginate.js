/**
 * Shared pagination utilities.
 */

export const POSTS_PER_PAGE = 9;

/**
 * Paginate an array of items.
 * @param {Array} items - Full array of items to paginate
 * @param {number} page - Current page number (1-indexed)
 * @param {number} [perPage=POSTS_PER_PAGE] - Items per page
 * @returns {{ items: Array, totalPages: number, currentPage: number, hasPrevious: boolean, hasNext: boolean }}
 */
export function paginate(items, page, perPage = POSTS_PER_PAGE) {
  const totalPages = items.length > 0 ? Math.ceil(items.length / perPage) : 0;
  const startIndex = (page - 1) * perPage;
  const endIndex = startIndex + perPage;
  const pageItems = items.length > 0 ? items.slice(startIndex, endIndex) : [];

  return {
    items: pageItems,
    totalPages,
    currentPage: page,
    hasPrevious: page > 1,
    hasNext: endIndex < items.length,
  };
}

/**
 * Generate static path objects for Astro getStaticPaths.
 * @param {Array} items - Full array of items
 * @param {number} [perPage=POSTS_PER_PAGE] - Items per page
 * @returns {{ params: { page: string } }[]}
 */
export function generatePaginationPaths(items, perPage = POSTS_PER_PAGE) {
  const totalPages = items.length > 0 ? Math.ceil(items.length / perPage) : 0;
  return Array.from({ length: totalPages }, (_, i) => ({
    params: { page: String(i + 1) },
  }));
}
