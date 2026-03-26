import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { consolidate, getStats } from '../src/consolidator.js';
import { analyzeFile } from '../src/analyzer.js';
import { normalizeDates, hasRelativeDates } from '../src/normalizer.js';
import { similarity, deduplicate, findExactDuplicates } from '../src/deduplicator.js';
import { checkStaleness, pruneEntries, trimToMaxLines, isProtected } from '../src/pruner.js';

// ── Helpers ──

function createTempWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodream-test-'));
  const memoryDir = path.join(tmpDir, 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  return tmpDir;
}

function copyFixtures(tmpDir) {
  const fixturesDir = path.join(import.meta.dirname, 'fixtures', 'daily-notes');
  const memoryDir = path.join(tmpDir, 'memory');
  const files = fs.readdirSync(fixturesDir);
  for (const f of files) {
    fs.copyFileSync(path.join(fixturesDir, f), path.join(memoryDir, f));
  }
}

function cleanup(tmpDir) {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// ══════════════════════════════════════
// Normalizer Tests
// ══════════════════════════════════════

describe('Normalizer', () => {
  it('should replace "yesterday" with absolute date', () => {
    const result = normalizeDates('Fixed the bug yesterday', '2026-03-25');
    assert.ok(result.includes('2026-03-24'), `Expected date 2026-03-24 in: ${result}`);
    assert.ok(!result.includes('yesterday'), 'Should not contain "yesterday"');
  });

  it('should replace "today" with absolute date', () => {
    const result = normalizeDates('Deployed today to production', '2026-03-25');
    assert.ok(result.includes('2026-03-25'), `Expected date 2026-03-25 in: ${result}`);
  });

  it('should replace "last week" with week-of reference', () => {
    const result = normalizeDates('Discussed last week with the team', '2026-03-25');
    assert.ok(result.includes('week of 2026-03-18'), `Expected week-of date in: ${result}`);
  });

  it('should replace "N days ago"', () => {
    const result = normalizeDates('Started 3 days ago', '2026-03-25');
    assert.ok(result.includes('2026-03-22'), `Expected date 2026-03-22 in: ${result}`);
  });

  it('should handle text with no relative dates', () => {
    const text = 'Regular text with 2026-03-25 date';
    assert.strictEqual(normalizeDates(text, '2026-03-25'), text);
  });

  it('should detect relative dates', () => {
    assert.ok(hasRelativeDates('Fixed it yesterday'));
    assert.ok(hasRelativeDates('Started 3 days ago'));
    assert.ok(!hasRelativeDates('Regular text with no dates'));
  });
});

// ══════════════════════════════════════
// Deduplicator Tests
// ══════════════════════════════════════

describe('Deduplicator', () => {
  it('should compute string similarity', () => {
    assert.strictEqual(similarity('hello world', 'hello world'), 1);
    assert.ok(similarity('hello world', 'hello worlds') > 0.8);
    assert.ok(similarity('completely different', 'nothing alike') < 0.5);
    assert.strictEqual(similarity('', 'hello'), 0);
  });

  it('should deduplicate similar entries keeping most recent', () => {
    const entries = [
      { text: 'Deployed the API to production', date: '2026-03-20', category: 'Projects & Work' },
      { text: 'Deployed the API to production successfully', date: '2026-03-22', category: 'Projects & Work' },
    ];
    const { kept, removed } = deduplicate(entries, 0.7);
    assert.strictEqual(kept.length, 1);
    assert.strictEqual(removed.length, 1);
    assert.strictEqual(kept[0].date, '2026-03-22'); // Most recent kept
  });

  it('should keep entries below similarity threshold', () => {
    const entries = [
      { text: 'Deployed API', date: '2026-03-20', category: 'Projects & Work' },
      { text: 'Fixed database migration bug', date: '2026-03-21', category: 'Projects & Work' },
    ];
    const { kept } = deduplicate(entries, 0.7);
    assert.strictEqual(kept.length, 2);
  });

  it('should find exact duplicates by hash', () => {
    const entries = [
      { text: 'Same entry here', date: '2026-03-20' },
      { text: 'Same entry here', date: '2026-03-21' },
      { text: 'Different entry', date: '2026-03-22' },
    ];
    const { unique, duplicates } = findExactDuplicates(entries);
    assert.strictEqual(unique.length, 2);
    assert.strictEqual(duplicates.length, 1);
  });

  it('should handle empty input', () => {
    const { kept, removed } = deduplicate([], 0.7);
    assert.strictEqual(kept.length, 0);
    assert.strictEqual(removed.length, 0);
  });
});

// ══════════════════════════════════════
// Pruner Tests
// ══════════════════════════════════════

describe('Pruner', () => {
  it('should flag completed tasks older than 7 days as stale', () => {
    const entry = {
      text: 'Fixed the login bug and merged the PR',
      date: '2026-03-01',
      importance: 5,
    };
    const { stale, reason } = checkStaleness(entry, '2026-03-25');
    assert.ok(stale, 'Should be stale');
    assert.ok(reason.includes('completed task'));
  });

  it('should keep recent completed tasks', () => {
    const entry = {
      text: 'Fixed the login bug and merged the PR',
      date: '2026-03-24',
      importance: 5,
    };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(!stale, 'Recent completed task should not be stale');
  });

  it('should never prune protected entries', () => {
    const entry = {
      text: '⚠️ NEVER use rm -rf on production servers — completed',
      date: '2025-01-01',
      importance: 5,
    };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(!stale, 'Protected entry should never be stale');
  });

  it('should respect custom preserve patterns', () => {
    const entry = {
      text: 'This has custom_tag and was fixed long ago',
      date: '2025-01-01',
      importance: 3,
    };
    const { stale } = checkStaleness(entry, '2026-03-25', ['custom_tag']);
    assert.ok(!stale, 'Custom preserved entry should not be stale');
  });

  it('should prune old low-importance entries', () => {
    const entry = {
      text: 'Some minor note',
      date: '2025-10-01',
      importance: 3,
    };
    const { stale, reason } = checkStaleness(entry, '2026-03-25');
    assert.ok(stale, 'Old low-importance entry should be stale');
    assert.ok(reason.includes('90 days'));
  });

  it('should protect high-importance entries regardless of age', () => {
    assert.ok(isProtected('⚠️ Critical warning'));
    assert.ok(isProtected('NEVER do this'));
    assert.ok(isProtected('ALWAYS check before deploying'));
    assert.ok(!isProtected('Regular text'));
  });

  it('should trim to max lines', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      text: `Entry ${i}`,
      date: '2026-03-25',
      importance: i % 10,
      category: 'Projects & Work',
    }));
    const { kept, trimmed } = trimToMaxLines(entries, 100);
    assert.ok(kept.length < entries.length, 'Should have trimmed some entries');
    assert.ok(trimmed.length > 0, 'Should have trimmed entries');
  });

  it('should batch prune entries', () => {
    const entries = [
      { text: 'Fixed bug', date: '2026-03-01', importance: 5 },
      { text: '⚠️ NEVER delete production DB', date: '2025-01-01', importance: 8 },
      { text: 'Minor debugging note', date: '2025-06-01', importance: 3 },
    ];
    const { kept, pruned } = pruneEntries(entries, '2026-03-25');
    assert.ok(kept.length > 0);
    assert.ok(pruned.length > 0);
    // Protected entry should always be kept
    assert.ok(kept.some((e) => e.text.includes('NEVER')));
  });
});

// ══════════════════════════════════════
// Analyzer Tests
// ══════════════════════════════════════

describe('Analyzer', () => {
  it('should extract entries from markdown', () => {
    const content = `# Daily Notes

## Work
- Deployed the API to production
- **Alice** reviewed the PR

## Personal
- Read a great article about TypeScript
`;
    const entries = analyzeFile(content, '2026-03-25', '2026-03-25.md');
    assert.ok(entries.length > 0, 'Should extract entries');
  });

  it('should classify people-related entries', () => {
    const content = `## Notes
- Meeting with **Bob Smith** about the team restructuring
`;
    const entries = analyzeFile(content, '2026-03-25', '2026-03-25.md');
    assert.ok(entries.length > 0);
    assert.strictEqual(entries[0].category, 'People & Relationships');
  });

  it('should classify technical decisions', () => {
    const content = `## Notes
- Decided to switch from PostgreSQL to SQLite for the local cache
`;
    const entries = analyzeFile(content, '2026-03-25', '2026-03-25.md');
    assert.ok(entries.length > 0);
    assert.strictEqual(entries[0].category, 'Technical Decisions');
  });

  it('should handle empty files gracefully', () => {
    const entries = analyzeFile('', '2026-03-25', '2026-03-25.md');
    assert.strictEqual(entries.length, 0);
  });

  it('should handle null content', () => {
    const entries = analyzeFile(null, '2026-03-25', '2026-03-25.md');
    assert.strictEqual(entries.length, 0);
  });
});

// ══════════════════════════════════════
// Consolidator Integration Tests
// ══════════════════════════════════════

describe('Consolidator', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempWorkspace();
    copyFixtures(tmpDir);
  });

  after(() => {
    cleanup(tmpDir);
  });

  it('should run full consolidation', () => {
    const report = consolidate(tmpDir, { force: true });
    assert.ok(!report.skipped, 'Should not be skipped');
    assert.ok(report.phase2.totalEntries > 0, 'Should have entries');
    assert.ok(report.phase4.finalEntryCount > 0, 'Should produce output');
    assert.ok(fs.existsSync(path.join(tmpDir, 'MEMORY.md')), 'Should create MEMORY.md');
  });

  it('should create backups on second run', () => {
    const report = consolidate(tmpDir, { force: true });
    assert.ok(!report.skipped);
    const backupDir = path.join(tmpDir, 'memory', '.autodream-backups');
    assert.ok(fs.existsSync(backupDir), 'Should create backup directory');
    const backups = fs.readdirSync(backupDir);
    assert.ok(backups.length > 0, 'Should have at least one backup');
  });

  it('should save consolidation reports', () => {
    const reportDir = path.join(tmpDir, 'memory', '.autodream-reports');
    assert.ok(fs.existsSync(reportDir), 'Report directory should exist');
    const reports = fs.readdirSync(reportDir);
    assert.ok(reports.length > 0, 'Should have at least one report');
  });

  it('should respect dry run mode', () => {
    const freshDir = createTempWorkspace();
    copyFixtures(freshDir);
    try {
      const report = consolidate(freshDir, { force: true, dryRun: true });
      assert.ok(!report.skipped);
      assert.ok(!fs.existsSync(path.join(freshDir, 'MEMORY.md')), 'Should NOT create MEMORY.md in dry run');
    } finally {
      cleanup(freshDir);
    }
  });

  it('should enforce max lines', () => {
    const report = consolidate(tmpDir, { force: true, maxLines: 50 });
    assert.ok(report.phase4.finalLineCount <= 50, `Expected ≤50 lines, got ${report.phase4.finalLineCount}`);
  });
});

// ══════════════════════════════════════
// Fresh workspace (no existing memory)
// ══════════════════════════════════════

describe('Fresh workspace', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempWorkspace();
    copyFixtures(tmpDir);
  });

  after(() => {
    cleanup(tmpDir);
  });

  it('should handle workspace with no existing MEMORY.md', () => {
    assert.ok(!fs.existsSync(path.join(tmpDir, 'MEMORY.md')));
    const report = consolidate(tmpDir, { force: true });
    assert.ok(!report.skipped);
    assert.ok(fs.existsSync(path.join(tmpDir, 'MEMORY.md')));
  });
});

// ══════════════════════════════════════
// Empty workspace
// ══════════════════════════════════════

describe('Empty workspace', () => {
  let tmpDir;

  before(() => {
    tmpDir = createTempWorkspace();
    // No fixtures copied — empty memory dir
  });

  after(() => {
    cleanup(tmpDir);
  });

  it('should handle empty memory directory gracefully', () => {
    const report = consolidate(tmpDir, { force: true });
    assert.ok(report.skipped);
    assert.ok(report.skipReason.includes('No daily files'));
  });

  it('should report zero stats', () => {
    const stats = getStats(tmpDir);
    assert.strictEqual(stats.totalDailyFiles, 0);
    assert.strictEqual(stats.lastRun, 'never');
  });
});
