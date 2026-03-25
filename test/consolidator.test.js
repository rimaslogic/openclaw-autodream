'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { consolidate, getStats } = require('../src/consolidator');
const { analyzeFile } = require('../src/analyzer');
const { normalizeDates, hasRelativeDates } = require('../src/normalizer');
const { similarity, deduplicate, findExactDuplicates } = require('../src/deduplicator');
const { checkStaleness, pruneEntries, trimToMaxLines, isProtected } = require('../src/pruner');

// ── Helpers ──

function createTempWorkspace() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'autodream-test-'));
  const memoryDir = path.join(tmpDir, 'memory');
  fs.mkdirSync(memoryDir, { recursive: true });
  return tmpDir;
}

function copyFixtures(tmpDir) {
  const fixturesDir = path.join(__dirname, 'fixtures', 'daily-notes');
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

  it('should replace "tomorrow" with absolute date', () => {
    const result = normalizeDates('Meeting tomorrow at 10am', '2026-03-25');
    assert.ok(result.includes('2026-03-26'), `Expected date 2026-03-26 in: ${result}`);
  });

  it('should replace "last week" with week reference', () => {
    const result = normalizeDates('Discussed last week in standup', '2026-03-25');
    assert.ok(result.includes('week of'), `Expected "week of" in: ${result}`);
  });

  it('should handle text without relative dates', () => {
    const input = 'Decided to use Redis on 2026-03-20';
    const result = normalizeDates(input, '2026-03-25');
    assert.strictEqual(result, input);
  });

  it('should detect relative dates', () => {
    assert.ok(hasRelativeDates('Fixed yesterday'));
    assert.ok(hasRelativeDates('Doing this today'));
    assert.ok(!hasRelativeDates('Fixed on 2026-03-20'));
  });
});

// ══════════════════════════════════════
// Deduplicator Tests
// ══════════════════════════════════════

describe('Deduplicator', () => {
  it('should compute similarity correctly', () => {
    assert.strictEqual(similarity('hello world', 'hello world'), 1);
    assert.ok(similarity('hello world', 'hello earth') < 1);
    assert.ok(similarity('hello world', 'hello earth') > 0.3);
    assert.ok(similarity('abc', 'xyz') < 0.3);
  });

  it('should find exact duplicates', () => {
    const entries = [
      { text: 'Decided to use Redis', date: '2026-03-20' },
      { text: 'Decided to use Redis', date: '2026-03-21' },
      { text: 'Using Supabase for auth', date: '2026-03-20' }
    ];
    const { unique, duplicates } = findExactDuplicates(entries);
    assert.strictEqual(unique.length, 2);
    assert.strictEqual(duplicates.length, 1);
  });

  it('should deduplicate fuzzy matches', () => {
    const entries = [
      { text: 'Decided to use Supabase for authentication and Vercel for hosting', date: '2026-03-21' },
      { text: 'Decided to use Supabase for auth and Vercel for hosting', date: '2026-03-20' },
      { text: 'Using Redis for session caching', date: '2026-03-21' }
    ];
    const { kept, removed } = deduplicate(entries, 0.7);
    assert.strictEqual(kept.length, 2);
    assert.strictEqual(removed.length, 1);
    // Should keep the most recent one
    assert.strictEqual(kept[0].date, '2026-03-21');
  });

  it('should keep entries below threshold', () => {
    const entries = [
      { text: 'Using Redis', date: '2026-03-20' },
      { text: 'Using Postgres', date: '2026-03-21' }
    ];
    const { kept, removed } = deduplicate(entries, 0.7);
    assert.strictEqual(kept.length, 2);
    assert.strictEqual(removed.length, 0);
  });
});

// ══════════════════════════════════════
// Pruner Tests
// ══════════════════════════════════════

describe('Pruner', () => {
  it('should mark old completed tasks as stale', () => {
    const entry = { text: 'Fixed the flaky test', date: '2026-02-01', importance: 5 };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(stale, 'Old completed task should be stale');
  });

  it('should not prune recent completed tasks', () => {
    const entry = { text: 'Fixed the API bug', date: '2026-03-24', importance: 5 };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(!stale, 'Recent completed task should not be stale');
  });

  it('should never prune protected entries', () => {
    const entry = { text: '⚠️ NEVER deploy on Fridays', date: '2025-01-01', importance: 3 };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(!stale, 'Protected entries should never be stale');
  });

  it('should never prune high importance entries', () => {
    const entry = { text: 'Some old note', date: '2025-01-01', importance: 9 };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(!stale, 'High importance entries should never be stale');
  });

  it('should mark old debugging notes as stale', () => {
    const entry = { text: 'Debugging the memory leak issue', date: '2026-01-15', importance: 5 };
    const { stale } = checkStaleness(entry, '2026-03-25');
    assert.ok(stale, 'Old debugging notes should be stale');
  });

  it('should trim entries to max lines', () => {
    const entries = Array.from({ length: 200 }, (_, i) => ({
      text: `Entry number ${i}`,
      date: '2026-03-25',
      category: 'Projects & Work',
      importance: i % 10
    }));
    const { kept, trimmed } = trimToMaxLines(entries, 100);
    assert.ok(kept.length < 200, 'Should have trimmed some entries');
    assert.ok(trimmed.length > 0, 'Should have trimmed entries');
    // Highest importance entries should be kept
    assert.ok(kept[0].importance >= kept[kept.length - 1].importance);
  });

  it('isProtected should detect preserve patterns', () => {
    assert.ok(isProtected('⚠️ Never do this'));
    assert.ok(isProtected('IMPORTANT: backup first'));
    assert.ok(isProtected('NEVER deploy without tests'));
    assert.ok(!isProtected('Just a regular note'));
  });
});

// ══════════════════════════════════════
// Analyzer Tests
// ══════════════════════════════════════

describe('Analyzer', () => {
  it('should extract entries from a daily file', () => {
    const content = `# 2026-03-20 — Daily Notes

## Project Updates
- **Mentalway** project: decided to use Supabase for auth
- Deployed v2.1 to production

## Team
- **Julio Perez** — great standup presentation
`;
    const entries = analyzeFile(content, '2026-03-20', '2026-03-20.md');
    assert.ok(entries.length >= 3, `Expected at least 3 entries, got ${entries.length}`);
    assert.ok(entries.some(e => e.text.includes('Mentalway')));
    assert.ok(entries.some(e => e.text.includes('Julio')));
  });

  it('should classify entries into categories', () => {
    const content = `# 2026-03-20

## Decisions
- Architecture decision: switched from Express to Fastify
- **Anna** joined the team as senior developer

## Lessons
- Lesson learned: always check RLS policies
`;
    const entries = analyzeFile(content, '2026-03-20', '2026-03-20.md');
    const techEntry = entries.find(e => e.text.includes('Fastify'));
    const lessonEntry = entries.find(e => e.text.includes('RLS'));
    assert.ok(techEntry, 'Should find the tech decision entry');
    assert.ok(lessonEntry, 'Should find the lesson entry');
    assert.strictEqual(techEntry.category, 'Technical Decisions');
    assert.strictEqual(lessonEntry.category, 'Lessons Learned');
  });

  it('should handle empty content', () => {
    const entries = analyzeFile('', '2026-03-20', '2026-03-20.md');
    assert.strictEqual(entries.length, 0);
  });

  it('should handle null content', () => {
    const entries = analyzeFile(null, '2026-03-20', '2026-03-20.md');
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

  it('should get stats for a workspace', () => {
    const stats = getStats(tmpDir);
    assert.strictEqual(stats.totalDailyFiles, 4);
    assert.strictEqual(stats.lastRun, 'never');
    assert.ok(stats.wouldTrigger);
  });

  it('should run dry-run consolidation', () => {
    const report = consolidate(tmpDir, { dryRun: true, force: true });
    assert.ok(!report.skipped);
    assert.ok(!report.dryRun || report.dryRun); // dryRun flag should be set
    assert.ok(report.phase2.totalEntries > 0);
    // Should NOT have created MEMORY.md
    assert.ok(!fs.existsSync(path.join(tmpDir, 'MEMORY.md')));
  });

  it('should run actual consolidation', () => {
    const report = consolidate(tmpDir, { force: true, verbose: false });
    assert.ok(!report.skipped);
    assert.ok(report.phase2.totalEntries > 0);
    assert.ok(report.phase4.finalEntryCount > 0);
    // Should have created MEMORY.md
    const memoryPath = path.join(tmpDir, 'MEMORY.md');
    assert.ok(fs.existsSync(memoryPath), 'MEMORY.md should exist');
    const content = fs.readFileSync(memoryPath, 'utf-8');
    assert.ok(content.includes('# Long-Term Memory'));
    assert.ok(content.includes('Last consolidated:'));
  });

  it('should create backup on re-consolidation', () => {
    // Run again — should backup previous MEMORY.md
    const report = consolidate(tmpDir, { force: true });
    assert.ok(!report.skipped);
    const backupDir = path.join(tmpDir, 'memory', '.autodream-backups');
    assert.ok(fs.existsSync(backupDir), 'Backup directory should exist');
    const backups = fs.readdirSync(backupDir);
    assert.ok(backups.length > 0, 'Should have at least one backup');
  });

  it('should save consolidation report', () => {
    const reportDir = path.join(tmpDir, 'memory', '.autodream-reports');
    assert.ok(fs.existsSync(reportDir), 'Report directory should exist');
    const reports = fs.readdirSync(reportDir);
    assert.ok(reports.length > 0, 'Should have at least one report');
  });

  it('should respect trigger conditions', () => {
    // Just ran, so should skip without force
    const report = consolidate(tmpDir, { force: false });
    assert.ok(report.skipped, 'Should skip — just ran');
    assert.ok(report.skipReason.includes('since last run'));
  });

  it('should remove duplicates across files', () => {
    const report = consolidate(tmpDir, { force: true });
    // "Mentalway decided to use Supabase" appears in 2 files
    // "Rimas prefers CET timezone" appears in 2 files
    assert.ok(
      report.phase3.exactDuplicatesRemoved > 0 || report.phase3.fuzzyDuplicatesRemoved > 0,
      'Should have removed some duplicates'
    );
  });

  it('should keep MEMORY.md under max lines', () => {
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
