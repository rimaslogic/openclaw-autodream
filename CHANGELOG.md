# Changelog

All notable user-facing changes to this project will be documented in this file.

## [Unreleased]

## [1.0.0] - 2026-03-25

### Added

- 4-phase memory consolidation pipeline (orientation → gather → consolidate → prune)
- Exact + fuzzy deduplication (Dice coefficient bigram similarity)
- Stale entry detection and pruning (completed tasks, old debugging notes, temporary workarounds)
- Relative date normalization (yesterday, today, last week → absolute dates)
- Entry classification into 6 categories (People, Projects, Preferences, Technical, Events, Lessons)
- Importance scoring (0-10) based on keyword patterns
- Protected entry patterns (⚠️, IMPORTANT, NEVER, ALWAYS are never pruned)
- Configurable via `.autodream.json`
- Trigger conditions (24h + 5 new files) with `--force` override
- `--dry-run` mode for safe preview
- `--stats` mode for memory statistics
- `--verbose` mode for detailed logging
- Automatic backups of previous `MEMORY.md` (last 10 retained)
- JSON consolidation reports
- OpenClaw skill definition (`skill/SKILL.md`)
- Zero external dependencies — pure Node.js
