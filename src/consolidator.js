'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { loadConfig, saveConfig } = require('./config');
const { getDailyFiles, readFileSafe, ensureDir, countLines, timestamp, formatDate, safePath } = require('./utils');
const { analyzeFile, extractPeople, extractProjects } = require('./analyzer');
const { normalizeDates } = require('./normalizer');
const { deduplicate, findExactDuplicates } = require('./deduplicator');
const { pruneEntries, trimToMaxLines } = require('./pruner');

/**
 * Main consolidation pipeline — 4-phase process.
 *
 * @param {string} workspacePath - Path to the OpenClaw workspace
 * @param {Object} options - { dryRun, force, verbose, maxLines, lookbackDays }
 * @returns {Object} Consolidation report
 */
function consolidate(workspacePath, options = {}) {
  const config = loadConfig(workspacePath);
  const {
    dryRun = false,
    force = false,
    verbose = false,
    maxLines = config.maxLines,
    lookbackDays = config.lookbackDays
  } = options;

  const memoryDirPath = safePath(workspacePath, config.memoryDir);
  const memoryIndexPath = safePath(workspacePath, config.memoryIndex);
  const backupDirPath = safePath(memoryDirPath, config.backupDir);
  const reportDirPath = safePath(memoryDirPath, config.reportDir);
  const now = new Date();
  const currentDate = formatDate(now);

  const report = {
    timestamp: timestamp(),
    phase1: { existingMemory: false, dailyFileCount: 0, newFileCount: 0 },
    phase2: { totalEntries: 0, entriesByCategory: {} },
    phase3: { exactDuplicatesRemoved: 0, fuzzyDuplicatesRemoved: 0, staleEntriesPruned: 0, datesNormalized: 0 },
    phase4: { finalEntryCount: 0, finalLineCount: 0, entriesTrimmed: 0 },
    dryRun,
    skipped: false,
    skipReason: null
  };

  // ── Check trigger conditions ──
  if (!force && config.lastRun) {
    const lastRunDate = new Date(config.lastRun);
    const hoursSinceLastRun = (now - lastRunDate) / (1000 * 60 * 60);
    const allFiles = getDailyFiles(memoryDirPath);
    const newFiles = allFiles.filter(f => !config.filesProcessedAtLastRun.includes(f.filename));

    if (hoursSinceLastRun < config.triggerThreshold.minHoursSinceLastRun &&
        newFiles.length < config.triggerThreshold.minNewFiles) {
      report.skipped = true;
      report.skipReason = `Only ${hoursSinceLastRun.toFixed(1)}h since last run (need ${config.triggerThreshold.minHoursSinceLastRun}h) and ${newFiles.length} new files (need ${config.triggerThreshold.minNewFiles}). Use --force to override.`;
      return report;
    }
  }

  const log = verbose ? console.log.bind(console) : () => {};

  // ════════════════════════════════════════
  // Phase 1: Orientation
  // ════════════════════════════════════════
  log('\n🌙 Phase 1: Orientation');

  const existingMemory = readFileSafe(memoryIndexPath);
  report.phase1.existingMemory = !!existingMemory;
  if (existingMemory) {
    log(`  Found existing ${config.memoryIndex} (${countLines(existingMemory)} lines)`);
  } else {
    log(`  No existing ${config.memoryIndex} found — will create fresh`);
  }

  const allDailyFiles = getDailyFiles(memoryDirPath);
  report.phase1.dailyFileCount = allDailyFiles.length;

  // Filter by lookback window
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - lookbackDays);
  const cutoffStr = formatDate(cutoffDate);

  const filesToProcess = force
    ? allDailyFiles
    : allDailyFiles.filter(f => {
        const isNew = !config.filesProcessedAtLastRun.includes(f.filename);
        const isRecent = f.date >= cutoffStr;
        return isNew || isRecent;
      });

  report.phase1.newFileCount = filesToProcess.length;
  log(`  ${allDailyFiles.length} total daily files, ${filesToProcess.length} to process`);

  if (filesToProcess.length === 0 && !existingMemory) {
    report.skipped = true;
    report.skipReason = 'No daily files found to process.';
    return report;
  }

  // ════════════════════════════════════════
  // Phase 2: Gather Signal
  // ════════════════════════════════════════
  log('\n🔍 Phase 2: Gather Signal');

  let allEntries = [];

  for (const file of filesToProcess) {
    const content = readFileSafe(file.path);
    if (!content) continue;

    // Normalize relative dates before analysis
    const normalized = normalizeDates(content, file.date);
    const dateNormCount = content !== normalized ? 1 : 0;
    report.phase3.datesNormalized += dateNormCount;

    const entries = analyzeFile(normalized, file.date, file.filename);
    allEntries.push(...entries);
    log(`  📄 ${file.filename}: ${entries.length} entries extracted`);
  }

  // Also parse existing MEMORY.md to merge with
  if (existingMemory) {
    const existingEntries = analyzeFile(existingMemory, currentDate, config.memoryIndex);
    allEntries.push(...existingEntries);
    log(`  📋 Existing ${config.memoryIndex}: ${existingEntries.length} entries`);
  }

  report.phase2.totalEntries = allEntries.length;
  for (const entry of allEntries) {
    report.phase2.entriesByCategory[entry.category] = (report.phase2.entriesByCategory[entry.category] || 0) + 1;
  }
  log(`  Total entries gathered: ${allEntries.length}`);

  // ════════════════════════════════════════
  // Phase 3: Consolidation
  // ════════════════════════════════════════
  log('\n🧹 Phase 3: Consolidation');

  // 3a. Remove exact duplicates
  const { unique: afterExact, duplicates: exactDups } = findExactDuplicates(allEntries);
  report.phase3.exactDuplicatesRemoved = exactDups.length;
  log(`  Exact duplicates removed: ${exactDups.length}`);

  // 3b. Fuzzy deduplication
  const { kept: afterFuzzy, removed: fuzzyDups } = deduplicate(afterExact, 0.75);
  report.phase3.fuzzyDuplicatesRemoved = fuzzyDups.length;
  log(`  Fuzzy duplicates removed: ${fuzzyDups.length}`);

  // 3c. Prune stale entries
  const { kept: afterPrune, pruned: staleEntries } = pruneEntries(afterFuzzy, currentDate, config.preservePatterns);
  report.phase3.staleEntriesPruned = staleEntries.length;
  log(`  Stale entries pruned: ${staleEntries.length}`);

  // ════════════════════════════════════════
  // Phase 4: Prune & Index
  // ════════════════════════════════════════
  log('\n📝 Phase 4: Prune & Index');

  // Enforce max lines
  const { kept: finalEntries, trimmed } = trimToMaxLines(afterPrune, maxLines);
  report.phase4.entriesTrimmed = trimmed.length;
  log(`  Entries trimmed to fit ${maxLines} lines: ${trimmed.length}`);

  // Build the output
  const output = buildMemoryIndex(finalEntries, config.categories, currentDate, report);
  report.phase4.finalEntryCount = finalEntries.length;
  report.phase4.finalLineCount = countLines(output);

  log(`  Final: ${finalEntries.length} entries, ${countLines(output)} lines`);

  // ── Write output ──
  if (!dryRun) {
    // Backup existing MEMORY.md
    if (existingMemory) {
      ensureDir(backupDirPath);
      const backupName = `MEMORY-${currentDate}-${Date.now()}.md`;
      fs.writeFileSync(path.join(backupDirPath, backupName), existingMemory, 'utf-8');
      log(`  💾 Backed up existing ${config.memoryIndex} → ${config.backupDir}/${backupName}`);

      // Rotate backups — keep last 10
      const MAX_BACKUPS = 10;
      const backups = fs.readdirSync(backupDirPath)
        .filter(f => f.startsWith('MEMORY-') && f.endsWith('.md'))
        .sort();
      if (backups.length > MAX_BACKUPS) {
        for (const old of backups.slice(0, backups.length - MAX_BACKUPS)) {
          fs.unlinkSync(path.join(backupDirPath, old));
          log(`  🗑️  Rotated old backup: ${old}`);
        }
      }
    }

    // Write new MEMORY.md
    fs.writeFileSync(memoryIndexPath, output, 'utf-8');
    log(`  ✅ Wrote ${config.memoryIndex} (${countLines(output)} lines)`);

    // Save consolidation report
    ensureDir(reportDirPath);
    const reportName = `consolidation-${currentDate}.json`;
    fs.writeFileSync(
      path.join(reportDirPath, reportName),
      JSON.stringify(report, null, 2) + '\n',
      'utf-8'
    );

    // Update config with last run info
    config.lastRun = timestamp();
    config.filesProcessedAtLastRun = allDailyFiles.map(f => f.filename);
    saveConfig(workspacePath, config);
  } else {
    log('\n  🔸 DRY RUN — no files modified');
    log('\n--- Generated MEMORY.md preview ---\n');
    log(output);
  }

  return report;
}

/**
 * Build the MEMORY.md content from categorized entries.
 */
function buildMemoryIndex(entries, categories, currentDate, report) {
  const lines = [];

  // Header with metadata
  lines.push('# Long-Term Memory');
  lines.push(`<!-- Last consolidated: ${timestamp()} | Files processed: ${report.phase1.newFileCount} | Entries: ${entries.length} -->`);
  lines.push('');

  // Group entries by category
  const grouped = {};
  for (const cat of categories) {
    grouped[cat] = [];
  }

  for (const entry of entries) {
    const cat = categories.includes(entry.category) ? entry.category : 'Projects & Work';
    grouped[cat].push(entry);
  }

  // Render each category
  for (const cat of categories) {
    const catEntries = grouped[cat];
    if (catEntries.length === 0) continue;

    // Sort by importance desc, then date desc
    catEntries.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return (b.date || '').localeCompare(a.date || '');
    });

    lines.push(`## ${cat}`);

    for (const entry of catEntries) {
      const dateTag = entry.date ? ` (${entry.date})` : '';
      // Trim long entries
      const text = entry.text.length > 200
        ? entry.text.substring(0, 197) + '...'
        : entry.text;
      lines.push(`- ${text}${dateTag}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get consolidation stats without running.
 */
function getStats(workspacePath) {
  const config = loadConfig(workspacePath);
  const memoryDirPath = safePath(workspacePath, config.memoryDir);
  const memoryIndexPath = safePath(workspacePath, config.memoryIndex);

  const dailyFiles = getDailyFiles(memoryDirPath);
  const existingMemory = readFileSafe(memoryIndexPath);
  const newFiles = dailyFiles.filter(f => !config.filesProcessedAtLastRun.includes(f.filename));

  let hoursSinceLastRun = null;
  if (config.lastRun) {
    hoursSinceLastRun = ((Date.now() - new Date(config.lastRun).getTime()) / (1000 * 60 * 60)).toFixed(1);
  }

  return {
    totalDailyFiles: dailyFiles.length,
    newFilesSinceLastRun: newFiles.length,
    lastRun: config.lastRun || 'never',
    hoursSinceLastRun,
    memoryIndexExists: !!existingMemory,
    memoryIndexLines: existingMemory ? countLines(existingMemory) : 0,
    maxLines: config.maxLines,
    triggerThreshold: config.triggerThreshold,
    wouldTrigger: !config.lastRun ||
      (hoursSinceLastRun >= config.triggerThreshold.minHoursSinceLastRun &&
       newFiles.length >= config.triggerThreshold.minNewFiles),
    oldestFile: dailyFiles.length > 0 ? dailyFiles[0].date : null,
    newestFile: dailyFiles.length > 0 ? dailyFiles[dailyFiles.length - 1].date : null
  };
}

module.exports = { consolidate, getStats, buildMemoryIndex };
