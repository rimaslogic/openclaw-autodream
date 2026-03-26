# OpenClaw Autodream - Memory Consolidation System

## Overview

An automatic memory consolidation system for OpenClaw agents, inspired by Claude Code's Autodream feature. This is an **OpenClaw skill** that can be installed into any OpenClaw workspace to provide automatic memory file consolidation — like "REM sleep" for AI agents.

## Architecture

This is a **standalone Node.js CLI tool + OpenClaw skill** that:
1. Analyzes the agent's `memory/` directory (daily `.md` files)
2. Consolidates insights into a clean, organized `MEMORY.md`
3. Prunes stale/contradictory information
4. Can be triggered automatically (via heartbeat/cron) or manually

## Directory Structure

```
openclaw-autodream/
├── README.md                    # Project documentation
├── package.json                 # Node.js package
├── LICENSE                      # MIT license
├── bin/
│   └── autodream.js             # CLI entry point
├── src/
│   ├── index.js                 # Main module export
│   ├── consolidator.js          # Core consolidation logic (4-phase process)
│   ├── analyzer.js              # Memory file analysis & pattern detection
│   ├── pruner.js                # Stale memory detection & removal
│   ├── normalizer.js            # Date normalization (relative → absolute)
│   ├── deduplicator.js          # Duplicate/overlapping entry detection
│   ├── config.js                # Configuration management
│   └── utils.js                 # Shared utilities
├── skill/
│   └── SKILL.md                 # OpenClaw skill definition
├── templates/
│   └── memory-index.md          # Template for MEMORY.md structure
└── test/
    ├── fixtures/                # Test memory files
    │   ├── daily-notes/         # Sample daily memory files
    │   └── expected/            # Expected consolidation output
    └── consolidator.test.js     # Tests
```

## Core Algorithm: 4-Phase Consolidation

### Phase 1: Orientation
- Read existing `MEMORY.md` (if exists) and build current memory map
- Scan `memory/` directory for all daily files
- Identify files modified since last consolidation
- Build a "state of memory" summary

### Phase 2: Gather Signal
- Parse each daily memory file for key patterns:
  - **Decisions**: Architecture choices, tool selections, workflow changes
  - **Preferences**: User preferences, style choices, recurring requests
  - **People**: Names, roles, relationships mentioned
  - **Projects**: Active projects, milestones, status changes
  - **Recurring themes**: Patterns appearing across multiple daily files
  - **Explicit saves**: Entries marked as important or "remember this"
- Score entries by frequency and recency

### Phase 3: Consolidation
- **Merge overlapping entries**: Same topic from multiple days → single entry
- **Resolve contradictions**: If user changed preference, keep latest
- **Normalize dates**: Convert "yesterday", "today", "last week" to absolute dates (using the daily file's date as reference)
- **Remove stale entries**: References to completed tasks, resolved issues, deleted files
- **Categorize entries**: Group into logical sections (People, Projects, Preferences, Technical, etc.)

### Phase 4: Prune & Index
- Keep `MEMORY.md` under configurable max lines (default: 200)
- Prioritize by: recency × frequency × importance
- Update section headers and organization
- Record consolidation metadata (timestamp, files processed, entries merged/pruned)

## CLI Interface

```bash
# Run consolidation on a workspace
autodream /path/to/workspace

# Dry run (show what would change without writing)
autodream /path/to/workspace --dry-run

# Verbose output
autodream /path/to/workspace --verbose

# Custom config
autodream /path/to/workspace --max-lines 150 --lookback-days 30

# Show consolidation stats
autodream /path/to/workspace --stats

# Force full reconsolidation (ignore last-run state)
autodream /path/to/workspace --force
```

## Configuration

Config stored in `.autodream.json` in workspace root:

```json
{
  "maxLines": 200,
  "lookbackDays": 30,
  "memoryDir": "memory",
  "memoryIndex": "MEMORY.md",
  "categories": [
    "People & Relationships",
    "Projects & Work",
    "Preferences & Style",
    "Technical Decisions",
    "Important Events",
    "Lessons Learned"
  ],
  "preservePatterns": ["⚠️", "IMPORTANT", "NEVER", "ALWAYS"],
  "lastRun": null
}
```

## OpenClaw Skill Integration

The `skill/SKILL.md` should make this usable as an OpenClaw skill that:
- Can be triggered via heartbeat (check if consolidation is needed)
- Can be triggered manually ("consolidate my memory" / "dream")
- Integrates with existing AGENTS.md memory maintenance workflow

### Trigger Conditions (matching Claude Code's approach)
- 24+ hours since last consolidation AND
- 5+ new daily memory files since last consolidation
- OR manual trigger via command

## Technical Requirements

- **Node.js 18+** (match OpenClaw requirements)
- **Zero external dependencies** for the core logic (use built-in Node.js APIs)
- Exception: can use `glob` or `minimatch` for file matching if needed
- **Pure text processing** - no LLM calls required for basic consolidation
- The consolidation logic should be deterministic and fast
- **LLM-enhanced mode** (optional): If an LLM is available, use it for smarter summarization and contradiction detection

## Important Design Decisions

1. **No LLM dependency for core functionality** - The basic consolidation (dedup, date normalization, categorization, pruning) should work with pure text processing. An optional LLM-enhanced mode can provide smarter consolidation.

2. **Non-destructive** - Always create a backup of MEMORY.md before modifying. Store backups in `memory/.autodream-backups/`.

3. **Incremental** - Only process files changed since last run (unless `--force`).

4. **Transparent** - Log what was merged, pruned, and why. Store consolidation reports in `memory/.autodream-reports/`.

## Output Format

MEMORY.md should follow this structure:

```markdown
# Long-Term Memory
<!-- Last consolidated: 2026-03-25T17:00:00Z | Files processed: 31 | Entries: 47 -->

## People & Relationships
- **Alice** - Head of Engineering at Acme Corp, values precision...
- **Bob Smith** - Team Lead test run (Jan-Mar 2026), passed evaluation...

## Projects & Work
- **Acme Corp** - Engineering team, pre-sales pipeline management...
- **Side Project** - Personal brand/consulting, newsletter...

## Preferences & Style
- No tolerance for hallucinations
- Notify on model fallback switches
- CET timezone

## Technical Decisions
- Using n8n for workflow automation
- Supabase + Vercel for Project Alpha (decided 2026-03-18)

## Important Events
- Q1 2026 review completed (2026-03-25): 30.1% margin, targeting 40%

## Lessons Learned
- ...
```

## Testing

Include test fixtures that simulate:
1. Fresh workspace (no MEMORY.md, several daily files)
2. Existing MEMORY.md + new daily files
3. Contradictory information across files
4. Stale references to completed tasks
5. Relative dates that need normalization
6. Duplicate entries across multiple days
