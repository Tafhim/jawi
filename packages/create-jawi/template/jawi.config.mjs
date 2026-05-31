/** @type {import('@jawi/core/config').JawiConfig} */
export default {
  site: {
    title: '{{SITE_TITLE}}',
    footer: '{{FOOTER_TEXT}}',
    url: '',
  },
  content: {
    dir: './content',
    postsPerPage: 9,
    tagsPerPage: 50,
  },
  display: {
    timezone: '{{TIMEZONE}}',
    dateFormat: '{{DATE_FORMAT}}',
  },
};
