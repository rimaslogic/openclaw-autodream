'use strict';

const { parseDate, formatDate } = require('./utils');

/**
 * Patterns that indicate an entry is stale or no longer relevant
 */
const STALE_PATTERNS = [
  // Completed/resolved tasks
  { pattern: /\b(?:fixed|resolved|completed|done|shipped|closed|merged)\b/i, reason: 'completed task' },
  // Temporary debugging
  { pattern: /\b(?:debugging|troubleshooting|investigating)\b/i, reason: 'debugging note', maxAgeDays: 14 },
  // Temporary workarounds
  { pattern: /\b(?:temporary|workaround|hack|quick fix|hotfix)\b/i, reason: 'temporary fix', maxAgeDays: 30 },
  // Version-specific issues
  { pattern: /\b(?:version|v\d+\.\d+|upgrade|downgrade)\b/i, reason: 'version-specific', maxAgeDays: 60 },
];

/**
 * Patterns that should NEVER be pruned
 */
const PRESERVE_PATTERNS = [
  /⚠️/,
  /\bIMPORTANT\b/i,
  /\bNEVER\b/i,
  /\bALWAYS\b/i,
  /\bDECISION\b/i,
  /\bARCHITECTURE\b/i,
  /\bPREFERENCE\b/i,
  /\bRULE\b/i,
];

/**
 * Check if an entry should be preserved regardless of age
 */
function isProtected(text, customPatterns = []) {
  if (PRESERVE_PATTERNS.some(pattern => pattern.test(text))) return true;
  // Custom patterns use case-insensitive string matching (not RegExp) to prevent ReDoS
  const lowerText = text.toLowerCase();
  return customPatterns.some(p => lowerText.includes(String(p).toLowerCase()));
}

/**
 * Determine if an entry is stale based on its content and age.
 * @param {Object} entry - { text, date, source, category, importance }
 * @param {string} currentDate - Current date as YYYY-MM-DD
 * @param {Array} customPreservePatterns - Additional patterns to never prune
 * @returns {{ stale: boolean, reason: string|null }}
 */
function checkStaleness(entry, currentDate, customPreservePatterns = []) {
  // Never prune protected entries
  if (isProtected(entry.text, customPreservePatterns)) {
    return { stale: false, reason: null };
  }

  // Never prune high-importance entries
  if (entry.importance >= 8) {
    return { stale: false, reason: null };
  }

  if (!entry.date) {
    return { stale: false, reason: null };
  }

  const entryDate = parseDate(entry.date);
  const now = parseDate(currentDate);
  const ageDays = Math.floor((now - entryDate) / (1000 * 60 * 60 * 24));

  for (const { pattern, reason, maxAgeDays } of STALE_PATTERNS) {
    if (pattern.test(entry.text)) {
      if (maxAgeDays && ageDays > maxAgeDays) {
        return { stale: true, reason: `${reason} (${ageDays} days old, threshold: ${maxAgeDays})` };
      }
      // For completed tasks without maxAge, mark stale after 7 days
      if (!maxAgeDays && reason === 'completed task' && ageDays > 7) {
        return { stale: true, reason: `${reason} (${ageDays} days old)` };
      }
    }
  }

  // Very old low-importance entries
  if (ageDays > 90 && entry.importance < 5) {
    return { stale: true, reason: `Low importance entry older than 90 days` };
  }

  return { stale: false, reason: null };
}

/**
 * Prune stale entries from a list.
 * @param {Array} entries - Array of entry objects
 * @param {string} currentDate - Current date YYYY-MM-DD
 * @param {Array} customPreservePatterns - Patterns to never prune
 * @returns {{ kept: Array, pruned: Array }}
 */
function pruneEntries(entries, currentDate, customPreservePatterns = []) {
  const kept = [];
  const pruned = [];

  for (const entry of entries) {
    const { stale, reason } = checkStaleness(entry, currentDate, customPreservePatterns);
    if (stale) {
      pruned.push({ ...entry, pruneReason: reason });
    } else {
      kept.push(entry);
    }
  }

  return { kept, pruned };
}

/**
 * Enforce a maximum line count by removing lowest-priority entries.
 * @param {Array} entries - Sorted entries
 * @param {number} maxLines - Maximum lines allowed
 * @returns {{ kept: Array, trimmed: Array }}
 */
function trimToMaxLines(entries, maxLines) {
  // Estimate lines per entry (bullet point = ~1-2 lines, section header overhead)
  // Rough: 1 entry ≈ 1.5 lines + category headers
  const categories = new Set(entries.map(e => e.category));
  const headerLines = (categories.size * 2) + 3; // ## Category + blank line each, plus top header + metadata
  const availableLines = maxLines - headerLines;
  const maxEntries = Math.floor(availableLines / 1.5);

  if (entries.length <= maxEntries) {
    return { kept: entries, trimmed: [] };
  }

  // Sort by importance (desc) then recency (desc)
  const sorted = [...entries].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    return (b.date || '').localeCompare(a.date || '');
  });

  return {
    kept: sorted.slice(0, maxEntries),
    trimmed: sorted.slice(maxEntries)
  };
}

module.exports = { checkStaleness, pruneEntries, trimToMaxLines, isProtected };
