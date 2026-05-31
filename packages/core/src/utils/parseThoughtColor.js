/**
 * Parse thought color field into a CSS background value.
 *
 * Supported formats:
 *   - solid-blue / solid-#efefef    → flat single color
 *   - gradient-red-purple           → multi-stop gradient
 *   - gradient-#000-#333-#666       → multi-stop gradient with hex
 *   - blue / purple                 → legacy single-name (auto-paired gradient)
 *   - (empty)                       → default #1a1a1a
 */

// Named color map for dark theme
const namedColors = {
  black:  'hsl(0, 0%, 0%)',
  white:  'hsl(0, 0%, 100%)',
  red:    'hsl(0, 45%, 18%)',
  orange: 'hsl(25, 50%, 18%)',
  yellow: 'hsl(45, 45%, 18%)',
  green:  'hsl(120, 40%, 18%)',
  teal:   'hsl(170, 40%, 18%)',
  blue:   'hsl(210, 45%, 18%)',
  purple: 'hsl(270, 40%, 18%)',
  pink:   'hsl(320, 40%, 18%)',
  gray:   'hsl(0, 0%, 18%)',
};

// Legacy single-name presets map to 2-stop gradients (backward compat)
const legacyGradients = {
  red:    ['hsl(0, 45%, 18%)', 'hsl(30, 40%, 14%)'],
  orange: ['hsl(25, 50%, 18%)', 'hsl(55, 45%, 14%)'],
  yellow: ['hsl(45, 45%, 18%)', 'hsl(75, 40%, 14%)'],
  green:  ['hsl(120, 40%, 18%)', 'hsl(160, 35%, 14%)'],
  teal:   ['hsl(170, 40%, 18%)', 'hsl(210, 35%, 14%)'],
  blue:   ['hsl(210, 45%, 18%)', 'hsl(250, 40%, 14%)'],
  purple: ['hsl(270, 40%, 18%)', 'hsl(310, 35%, 14%)'],
  pink:   ['hsl(320, 40%, 18%)', 'hsl(350, 35%, 14%)'],
};

function resolveColor(token) {
  const t = token.toLowerCase();
  if (t.startsWith('#')) return t;
  return namedColors[t] || t;
}

/**
 * Parse gradient stops: handles "red-blue-green", "#000-#fff", "red-#000-blue"
 */
function parseGradientStops(str) {
  const matches = str.match(/#[0-9a-fA-F]{3,8}|\b[a-zA-Z]+\b/g);
  if (!matches) return [];
  return matches.map(resolveColor);
}

/**
 * Parse a color value string into a CSS background value.
 * @param {string} value - Color field value from frontmatter
 * @returns {string} CSS background value
 */
export function parseThoughtColor(value) {
  if (!value) return '#1a1a1a';

  const v = value.trim().toLowerCase();

  if (v.startsWith('solid-')) {
    const c = v.slice(6);
    return resolveColor(c);
  }

  if (v.startsWith('gradient-')) {
    const stops = parseGradientStops(v.slice(9));
    if (stops.length >= 2) {
      return `linear-gradient(135deg, ${stops.join(', ')})`;
    }
    return '#1a1a1a';
  }

  // Legacy single-name presets (backward compat)
  if (legacyGradients[v]) {
    const [a, b] = legacyGradients[v];
    return `linear-gradient(135deg, ${a}, ${b})`;
  }

  return '#1a1a1a';
}
