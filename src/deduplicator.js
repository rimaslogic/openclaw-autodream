import { simpleHash, stripMarkdown } from './utils.js';

/**
 * Compute similarity between two strings using bigram overlap (Dice coefficient).
 * Returns a value between 0 (completely different) and 1 (identical).
 */
export function similarity(a, b) {
  if (!a || !b) return 0;

  const strA = stripMarkdown(a).toLowerCase();
  const strB = stripMarkdown(b).toLowerCase();

  if (strA === strB) return 1;
  if (strA.length < 2 || strB.length < 2) return 0;

  const bigramsA = new Set();
  for (let i = 0; i < strA.length - 1; i++) {
    bigramsA.add(strA.substring(i, i + 2));
  }

  const bigramsB = new Set();
  for (let i = 0; i < strB.length - 1; i++) {
    bigramsB.add(strB.substring(i, i + 2));
  }

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }

  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/**
 * Deduplicate a list of entries.
 * Returns deduplicated list, keeping the most recent version of duplicates.
 *
 * @param {Array} entries - Array of entry objects
 * @param {number} threshold - Similarity threshold (0-1), default 0.7
 * @returns {{ kept: Array, removed: Array }}
 */
export function deduplicate(entries, threshold = 0.7) {
  if (!entries || entries.length === 0) return { kept: [], removed: [] };

  const sorted = [...entries].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return b.date.localeCompare(a.date);
  });

  const kept = [];
  const removed = [];
  const usedIndices = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (usedIndices.has(i)) continue;

    const entry = sorted[i];
    kept.push(entry);

    for (let j = i + 1; j < sorted.length; j++) {
      if (usedIndices.has(j)) continue;

      const sim = similarity(entry.text, sorted[j].text);
      if (sim >= threshold) {
        usedIndices.add(j);
        removed.push({
          ...sorted[j],
          reason: `Duplicate of entry from ${entry.date} (similarity: ${(sim * 100).toFixed(0)}%)`,
          similarTo: entry.text.substring(0, 80),
        });
      }
    }
  }

  return { kept, removed };
}

/**
 * Find exact duplicates (hash-based, fast)
 */
export function findExactDuplicates(entries) {
  const seen = new Map();
  const unique = [];
  const duplicates = [];

  for (const entry of entries) {
    const hash = simpleHash(stripMarkdown(entry.text).toLowerCase());
    if (seen.has(hash)) {
      duplicates.push({
        ...entry,
        reason: `Exact duplicate of entry from ${seen.get(hash).date}`,
      });
    } else {
      seen.set(hash, entry);
      unique.push(entry);
    }
  }

  return { unique, duplicates };
}
