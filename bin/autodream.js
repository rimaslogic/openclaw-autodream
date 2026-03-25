#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { consolidate, getStats } = require('../src/consolidator');

const USAGE = `
  autodream — Memory consolidation for OpenClaw agents

  Usage:
    autodream <workspace-path> [options]

  Options:
    --dry-run        Show what would change without writing files
    --force          Force full reconsolidation (ignore trigger conditions)
    --verbose        Detailed output during consolidation
    --stats          Show consolidation stats and exit
    --max-lines N    Maximum lines for MEMORY.md (default: 200)
    --lookback N     Days to look back for daily files (default: 30)
    --help           Show this help message
    --version        Show version

  Examples:
    autodream .                           # Consolidate current directory
    autodream ~/workspace --dry-run       # Preview consolidation
    autodream ~/workspace --force         # Force full reconsolidation
    autodream ~/workspace --stats         # Show memory stats
    autodream ~/workspace --verbose       # Detailed logging
`;

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(USAGE);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    const pkg = require('../package.json');
    console.log(`autodream v${pkg.version}`);
    process.exit(0);
  }

  // Parse arguments
  const workspacePath = path.resolve(args.find(a => !a.startsWith('--')) || '.');
  const dryRun = args.includes('--dry-run');
  const force = args.includes('--force');
  const verbose = args.includes('--verbose');
  const showStats = args.includes('--stats');

  let maxLines;
  const maxLinesIdx = args.indexOf('--max-lines');
  if (maxLinesIdx !== -1 && args[maxLinesIdx + 1]) {
    maxLines = parseInt(args[maxLinesIdx + 1], 10);
    if (isNaN(maxLines) || maxLines < 20) {
      console.error('Error: --max-lines must be a number >= 20');
      process.exit(1);
    }
  }

  let lookbackDays;
  const lookbackIdx = args.indexOf('--lookback');
  if (lookbackIdx !== -1 && args[lookbackIdx + 1]) {
    lookbackDays = parseInt(args[lookbackIdx + 1], 10);
    if (isNaN(lookbackDays) || lookbackDays < 1) {
      console.error('Error: --lookback must be a number >= 1');
      process.exit(1);
    }
  }

  // Verify workspace exists
  const fs = require('node:fs');
  if (!fs.existsSync(workspacePath)) {
    console.error(`Error: Workspace path does not exist: ${workspacePath}`);
    process.exit(1);
  }

  // Stats mode
  if (showStats) {
    const stats = getStats(workspacePath);
    console.log('\n🌙 Autodream Memory Stats\n');
    console.log(`  Daily files:       ${stats.totalDailyFiles}`);
    console.log(`  New since last:    ${stats.newFilesSinceLastRun}`);
    console.log(`  Last run:          ${stats.lastRun}`);
    if (stats.hoursSinceLastRun) {
      console.log(`  Hours since run:   ${stats.hoursSinceLastRun}h`);
    }
    console.log(`  MEMORY.md exists:  ${stats.memoryIndexExists ? `yes (${stats.memoryIndexLines} lines)` : 'no'}`);
    console.log(`  Max lines:         ${stats.maxLines}`);
    console.log(`  Date range:        ${stats.oldestFile || 'N/A'} → ${stats.newestFile || 'N/A'}`);
    console.log(`  Would trigger:     ${stats.wouldTrigger ? '✅ yes' : '❌ no'}`);
    console.log(`  Trigger threshold: ${stats.triggerThreshold.minHoursSinceLastRun}h + ${stats.triggerThreshold.minNewFiles} files`);
    console.log('');
    process.exit(0);
  }

  // Run consolidation
  console.log(`\n🌙 Autodream — Memory Consolidation`);
  console.log(`   Workspace: ${workspacePath}`);
  if (dryRun) console.log('   Mode: DRY RUN (no files will be modified)');
  if (force) console.log('   Mode: FORCE (ignoring trigger conditions)');
  console.log('');

  try {
    const report = consolidate(workspacePath, {
      dryRun,
      force,
      verbose,
      maxLines,
      lookbackDays
    });

    if (report.skipped) {
      console.log(`⏭️  Skipped: ${report.skipReason}`);
      process.exit(0);
    }

    // Summary
    console.log('\n📊 Consolidation Summary');
    console.log('─'.repeat(40));
    console.log(`  Files processed:          ${report.phase1.newFileCount}`);
    console.log(`  Total entries gathered:    ${report.phase2.totalEntries}`);
    console.log(`  Exact duplicates removed:  ${report.phase3.exactDuplicatesRemoved}`);
    console.log(`  Fuzzy duplicates removed:  ${report.phase3.fuzzyDuplicatesRemoved}`);
    console.log(`  Stale entries pruned:      ${report.phase3.staleEntriesPruned}`);
    console.log(`  Dates normalized:          ${report.phase3.datesNormalized}`);
    console.log(`  Entries trimmed (overflow): ${report.phase4.entriesTrimmed}`);
    console.log(`  Final entries:             ${report.phase4.finalEntryCount}`);
    console.log(`  Final MEMORY.md lines:     ${report.phase4.finalLineCount}`);
    console.log('─'.repeat(40));

    if (report.phase2.entriesByCategory) {
      console.log('\n  Entries by category:');
      for (const [cat, count] of Object.entries(report.phase2.entriesByCategory)) {
        console.log(`    ${cat}: ${count}`);
      }
    }

    if (dryRun) {
      console.log('\n🔸 Dry run complete — no files were modified.');
    } else {
      console.log('\n✅ Consolidation complete!');
    }
    console.log('');

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    if (verbose) console.error(err.stack);
    process.exit(1);
  }
}

main();
