# 🌙 OpenClaw Autodream

**Automatic memory consolidation for OpenClaw agents — like REM sleep for AI memory.**

Autodream analyzes your agent's daily memory files, removes duplicates, prunes stale entries, normalizes relative dates, and builds a clean, organized `MEMORY.md` index. Inspired by [Claude Code's Autodream](https://claudefa.st/blog/guide/mechanics/auto-dream) feature.

## The Problem

OpenClaw agents accumulate daily memory files (`memory/YYYY-MM-DD.md`) over time. Without consolidation:
- **Duplicates pile up** — same information recorded across multiple days
- **Stale entries persist** — completed tasks, resolved bugs, outdated workarounds
- **Relative dates decay** — "yesterday" and "last week" become meaningless
- **No organization** — insights scattered across dozens of files
- **No long-term memory** — agents read recent files but miss older patterns

## The Solution

Autodream runs a **4-phase consolidation pipeline** (no LLM required):

1. **Orientation** — Maps current memory state, identifies files to process
2. **Gather Signal** — Extracts and classifies entries from daily files
3. **Consolidation** — Deduplicates, prunes stale entries, normalizes dates
4. **Prune & Index** — Enforces size limits, writes organized `MEMORY.md`

## Installation

```bash
npm install -g openclaw-autodream
```

Or clone and link:

```bash
git clone https://github.com/rimasluk/openclaw-autodream.git
cd openclaw-autodream
npm link
```

## Usage

```bash
# Check if consolidation is needed
autodream ~/.openclaw/workspace --stats

# Preview what would change (dry run)
autodream ~/.openclaw/workspace --dry-run --verbose

# Run consolidation
autodream ~/.openclaw/workspace --verbose

# Force full reconsolidation (ignore trigger conditions)
autodream ~/.openclaw/workspace --force --verbose

# Custom limits
autodream ~/.openclaw/workspace --max-lines 150 --lookback 60
```

### Options

| Flag | Description |
|------|-------------|
| `--dry-run` | Preview changes without writing files |
| `--force` | Ignore trigger conditions (24h + 5 files) |
| `--verbose` | Detailed output during consolidation |
| `--stats` | Show memory statistics and exit |
| `--max-lines N` | Maximum lines for MEMORY.md (default: 200) |
| `--lookback N` | Days to look back for daily files (default: 30) |
| `--help` | Show help message |
| `--version` | Show version |

## How It Works

### Phase 1: Orientation
Reads existing `MEMORY.md` (if any), scans the `memory/` directory, and identifies files changed since the last consolidation.

### Phase 2: Gather Signal
Parses each daily file and extracts structured entries. Each entry is:
- **Classified** into categories (People, Projects, Preferences, Technical Decisions, Events, Lessons)
- **Scored** by importance (0-10) based on keywords and patterns

### Phase 3: Consolidation
- **Exact dedup** — Hash-based removal of identical entries
- **Fuzzy dedup** — Bigram similarity (Dice coefficient) removes entries >75% similar, keeping the most recent
- **Stale pruning** — Removes old debugging notes (>14 days), temporary workarounds (>30 days), completed tasks (>7 days)
- **Date normalization** — Converts "yesterday", "today", "last week" to absolute dates using the file's date as reference
- **Protected entries** — Entries containing ⚠️, IMPORTANT, NEVER, ALWAYS are never pruned

### Phase 4: Prune & Index
Enforces the max line limit by keeping highest-importance + most-recent entries. Writes a clean `MEMORY.md` with category sections and metadata.

## Trigger Conditions

By default, consolidation triggers when **both** conditions are met:
- **24+ hours** since last consolidation
- **5+ new daily files** since last consolidation

Use `--force` to bypass these conditions.

## Configuration

Create `.autodream.json` in your workspace root:

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
  "triggerThreshold": {
    "minHoursSinceLastRun": 24,
    "minNewFiles": 5
  }
}
```

## Output Example

```markdown
# Long-Term Memory
<!-- Last consolidated: 2026-03-25T17:00:00Z | Files processed: 29 | Entries: 123 -->

## People & Relationships
- **Julio Perez** — Team Lead test run passed, all scores ≥4/5 (2026-03-25)
- **Anna Kowalski** — Q2 budget approved (2026-03-21)

## Projects & Work
- **Cloudvisor** — Q1 review: 30.1% margin, targeting 40% (2026-03-25)
- **Mentalway** — Supabase + Vercel architecture decided (2026-03-18)

## Preferences & Style
- Values precision, no tolerance for hallucinations (2026-02-01)
- CET timezone for all scheduling (2026-02-01)

## Technical Decisions
- Redis for session caching (2026-03-21)
- n8n for workflow automation (2026-02-06)

## Important Events
- Q1 2026 engineering review completed (2026-03-25)

## Lessons Learned
- Always test database migrations on staging first (2026-03-22)
- Supabase RLS policies don't apply to service role key (2026-03-22)
```

## Safety

- **Non-destructive** — Previous `MEMORY.md` is always backed up to `memory/.autodream-backups/`
- **Reports** — Consolidation details saved to `memory/.autodream-reports/`
- **Dry run** — Always preview with `--dry-run` before running
- **Protected entries** — Configurable patterns that are never pruned
- **Zero dependencies** — Pure Node.js, no external packages

## OpenClaw Skill

The `skill/` directory contains an OpenClaw skill definition. Install it in your workspace:

```bash
cp -r skill/SKILL.md ~/.openclaw/workspace/skills/autodream/SKILL.md
```

Or use with heartbeats by adding to your `HEARTBEAT.md`:

```markdown
## Memory Consolidation
- Run `autodream <workspace> --stats` to check if needed
- If "Would trigger: ✅ yes", run `autodream <workspace> --verbose`
```

## Comparison: Claude Code Autodream vs OpenClaw Autodream

| Feature | Claude Code | OpenClaw Autodream |
|---------|------------|-------------------|
| Automatic trigger | ✅ 24h + 5 sessions | ✅ 24h + 5 files |
| Session transcript mining | ✅ (LLM-powered) | ❌ (file-based only) |
| Date normalization | ✅ | ✅ |
| Contradiction resolution | ✅ (LLM-powered) | ✅ (recency-based) |
| Deduplication | ✅ | ✅ (exact + fuzzy) |
| Stale pruning | ✅ | ✅ |
| Size enforcement | ✅ (200 lines) | ✅ (configurable) |
| Manual trigger | `/dream` command | `autodream` CLI |
| Backups | Unknown | ✅ Always |
| Reports | Unknown | ✅ JSON reports |
| LLM required | Yes | **No** (pure text) |
| Background execution | ✅ | Via cron/heartbeat |

## Development

```bash
# Run tests
npm test

# Run against a workspace
node bin/autodream.js /path/to/workspace --dry-run --verbose
```

## License

MIT
