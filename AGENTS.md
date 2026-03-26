# Repository Guidelines

- Repo: https://github.com/rimaslogic/openclaw-autodream
- File references must be repo-root relative (example: `src/consolidator.js:80`); never absolute paths.

## Project Structure

```
openclaw-autodream/
├── bin/autodream.js          # CLI entry point
├── src/
│   ├── index.js              # Main module exports
│   ├── consolidator.js       # Core 4-phase consolidation pipeline
│   ├── analyzer.js           # Memory file analysis & pattern classification
│   ├── deduplicator.js       # Exact + fuzzy duplicate detection (Dice coefficient)
│   ├── normalizer.js         # Relative → absolute date normalization
│   ├── pruner.js             # Stale entry detection & removal
│   ├── config.js             # Configuration loading & persistence
│   └── utils.js              # Shared utilities (path safety, markdown parsing)
├── skill/SKILL.md            # OpenClaw skill definition
├── templates/memory-index.md # MEMORY.md template
├── test/
│   ├── consolidator.test.js  # All tests (unit + integration)
│   └── fixtures/daily-notes/ # Test memory files
├── AGENTS.md                 # This file
├── CONTRIBUTING.md            # Contributor guide
├── CHANGELOG.md              # User-facing changes
├── SPEC.md                   # Full specification
└── package.json
```

## Build & Development Commands

- **Runtime:** Node 22+ (ESM, zero external dependencies)
- **Install deps:** `npm install`
- **Run tests:** `npm test`
- **Lint:** `npx biome check src/ test/ bin/`
- **Format:** `npx biome format --write src/ test/ bin/`
- **Run CLI (dev):** `node bin/autodream.js <workspace-path> [options]`

## Coding Style

- **Language:** JavaScript (ESM). `"type": "module"` in package.json.
- **Imports:** Use `import` / `export`. Always include `.js` extension in relative imports.
- **Node builtins:** Use `node:` prefix (e.g., `import fs from 'node:fs'`).
- **Formatting/linting:** Biome (check + format).
- **No external runtime dependencies.** This is a zero-dependency tool by design. Dev dependencies (Biome) are allowed.
- **Path safety:** All file operations on user workspaces MUST use `safePath()` from `utils.js` to prevent path traversal.
- **Error handling:** Graceful degradation. Never crash on malformed user memory files — skip and warn.

## Testing Guidelines

- **Framework:** Node.js built-in test runner (`node --test`).
- **Test file:** `test/consolidator.test.js` (covers all modules).
- **Naming:** Describe blocks per module (Normalizer, Deduplicator, Pruner, Analyzer, Consolidator).
- **Fixtures:** `test/fixtures/daily-notes/` contains sample daily memory files.
- **Temp workspaces:** Tests create temp directories and clean up in `after()` hooks.
- **Run before pushing:** Always run `npm test` before committing.

## Module Boundaries

- `consolidator.js` is the orchestrator — it calls analyzer, normalizer, deduplicator, pruner.
- `utils.js` is the shared utility layer — pure functions, no side effects except `ensureDir`.
- `config.js` handles all `.autodream.json` I/O.
- `bin/autodream.js` is CLI-only — arg parsing + display. No business logic.
- **Do not** add business logic to `bin/autodream.js`. Keep it thin.
- **Do not** import from `bin/` in `src/` files.

## Security Notes

- This tool processes **user memory files** that may contain sensitive data (credentials, personal info, API keys).
- Never log or expose full file contents in error messages.
- Test fixtures must NOT contain real credentials or PII.
- `safePath()` prevents path traversal attacks — always use it for user-provided paths.
