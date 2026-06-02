/**
 * @jawi/core - Utils Barrel Export
 *
 * Single import point for all utility functions.
 */

// Config
export { loadConfig, defaultConfig, validateConfig, validateTimezone, validateDateFormat } from '../config.js';

// Parsing
export { parseFrontmatter } from './parseFrontmatter.js';
export { parseMarkdown } from './parseMarkdown.js';
export { convertEmojis, EMOJI_MAP } from './emoji.js';

// Content finders
export { findPosts, findPostBySlug, getPostsByTag, getUniqueTags } from './findPosts.js';
export { findThoughts, findThoughtBySlug, getThoughtsByTag, getUniqueThoughtTags } from './findThoughts.js';
export { findCodes, findCodeBySlug } from './findCodes.js';

// Tags
export { getAllUniqueTags, getItemsByTag } from './findByTag.js';
export { getAllTagsWithCounts } from './getAllTagsWithCounts.js';
export { normalizeTag } from './normalizeTag.js';

// Formatting
export { formatDate, formatDateClientSide, DAYS, DAYS_SHORT, MONTHS, MONTHS_SHORT, ordinal, to12Hour, getDayOfWeek, parseTimeStr, formatWithPreset } from './formatDate.js';
export { readTimezone, isUserTimezone, utcNow, parseUTC, toLocalTime, formatUTC, formatForDisplay } from './timezone.js';

// Pagination
export { paginate, generatePaginationPaths, POSTS_PER_PAGE } from './paginate.js';

// Helpers
export { generateSlug } from './generateSlug.js';
export { getExcerpt } from './getExcerpt.js';
export { getFirstHeading } from './getFirstHeading.js';
export { parseThoughtColor } from './parseThoughtColor.js';
