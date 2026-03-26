import fs from 'node:fs';
import path from 'node:path';

/**
 * Resolve a path within a base directory, preventing path traversal.
 * Throws if the resolved path escapes the base.
 */
export function safePath(base, relative) {
  const resolved = path.resolve(base, relative);
  const resolvedBase = path.resolve(base);
  if (!resolved.startsWith(resolvedBase + path.sep) && resolved !== resolvedBase) {
    throw new Error(`Path traversal blocked: "${relative}" escapes base directory "${base}"`);
  }
  return resolved;
}

/**
 * Extract date from a daily memory filename like "2026-03-25.md"
 */
export function extractDateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})\.md$/);
  return match ? match[1] : null;
}

/**
 * Parse a YYYY-MM-DD string into a Date object (local midnight)
 */
export function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Format date as YYYY-MM-DD
 */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get all daily memory files from the memory directory, sorted by date
 */
export function getDailyFiles(memoryDirPath) {
  if (!fs.existsSync(memoryDirPath)) return [];

  return fs
    .readdirSync(memoryDirPath)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort()
    .map((f) => ({
      filename: f,
      date: extractDateFromFilename(f),
      path: path.join(memoryDirPath, f),
    }));
}

/**
 * Read file contents safely
 */
export function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Ensure a directory exists
 */
export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

/**
 * Count lines in a string
 */
export function countLines(text) {
  if (!text) return 0;
  return text.split('\n').length;
}

/**
 * Generate ISO timestamp string
 */
export function timestamp() {
  return new Date().toISOString();
}

/**
 * Simple hash for deduplication (content-based)
 */
export function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString(36);
}

/**
 * Strip markdown formatting for comparison
 */
export function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s+/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^[-*+]\s+/gm, '')
    .trim();
}

/**
 * Extract bullet points from markdown text
 */
export function extractBullets(text) {
  const lines = text.split('\n');
  const bullets = [];
  let currentBullet = null;

  for (const line of lines) {
    const bulletMatch = line.match(/^(\s*)[-*+]\s+(.*)/);
    if (bulletMatch) {
      if (currentBullet) bullets.push(currentBullet);
      currentBullet = { indent: bulletMatch[1].length, text: bulletMatch[2].trim() };
    } else if (currentBullet && line.match(/^\s+\S/) && !line.match(/^#{1,6}\s/)) {
      // Continuation line
      currentBullet.text += ` ${line.trim()}`;
    } else {
      if (currentBullet) bullets.push(currentBullet);
      currentBullet = null;
    }
  }
  if (currentBullet) bullets.push(currentBullet);
  return bullets;
}

/**
 * Extract sections (## headers) from markdown
 */
export function extractSections(text) {
  const lines = text.split('\n');
  const sections = [];
  let currentSection = null;

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,3})\s+(.*)/);
    if (headerMatch) {
      if (currentSection) sections.push(currentSection);
      currentSection = {
        level: headerMatch[1].length,
        title: headerMatch[2].trim(),
        content: [],
      };
    } else if (currentSection) {
      currentSection.content.push(line);
    }
  }
  if (currentSection) sections.push(currentSection);
  return sections;
}
