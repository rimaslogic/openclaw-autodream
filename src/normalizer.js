'use strict';

const { parseDate, formatDate } = require('./utils');

/**
 * Relative date patterns and their resolvers.
 * Each pattern returns the resolved absolute date string given the reference date.
 */
const RELATIVE_PATTERNS = [
  {
    pattern: /\byesterday\b/gi,
    resolve: (refDate) => {
      const d = new Date(refDate);
      d.setDate(d.getDate() - 1);
      return formatDate(d);
    }
  },
  {
    pattern: /\btoday\b/gi,
    resolve: (refDate) => formatDate(refDate)
  },
  {
    pattern: /\btomorrow\b/gi,
    resolve: (refDate) => {
      const d = new Date(refDate);
      d.setDate(d.getDate() + 1);
      return formatDate(d);
    }
  },
  {
    pattern: /\blast week\b/gi,
    resolve: (refDate) => {
      const d = new Date(refDate);
      d.setDate(d.getDate() - 7);
      return `week of ${formatDate(d)}`;
    }
  },
  {
    pattern: /\bthis week\b/gi,
    resolve: (refDate) => `week of ${formatDate(refDate)}`
  },
  {
    pattern: /\blast month\b/gi,
    resolve: (refDate) => {
      const d = new Date(refDate);
      d.setMonth(d.getMonth() - 1);
      const y = d.getFullYear();
      const m = d.toLocaleString('en-US', { month: 'long' });
      return `${m} ${y}`;
    }
  },
  {
    pattern: /\b(\d+)\s+days?\s+ago\b/gi,
    resolve: (refDate, match) => {
      const days = parseInt(match[1], 10);
      const d = new Date(refDate);
      d.setDate(d.getDate() - days);
      return formatDate(d);
    }
  },
  {
    pattern: /\b(\d+)\s+weeks?\s+ago\b/gi,
    resolve: (refDate, match) => {
      const weeks = parseInt(match[1], 10);
      const d = new Date(refDate);
      d.setDate(d.getDate() - weeks * 7);
      return `week of ${formatDate(d)}`;
    }
  }
];

/**
 * Normalize relative dates in text using the file's date as reference.
 * @param {string} text - The text content to normalize
 * @param {string} referenceDateStr - YYYY-MM-DD of the file this text came from
 * @returns {string} Text with relative dates replaced by absolute dates
 */
function normalizeDates(text, referenceDateStr) {
  if (!text || !referenceDateStr) return text;

  const refDate = parseDate(referenceDateStr);
  let result = text;

  for (const { pattern, resolve } of RELATIVE_PATTERNS) {
    result = result.replace(pattern, (...args) => {
      // For patterns with capture groups, pass the match array
      const match = args.length > 3 ? args : null;
      const resolved = resolve(refDate, match ? args : null);
      return resolved;
    });
  }

  return result;
}

/**
 * Check if text contains relative date references
 */
function hasRelativeDates(text) {
  if (!text) return false;
  return RELATIVE_PATTERNS.some(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

module.exports = { normalizeDates, hasRelativeDates };
