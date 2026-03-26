# Contributing to OpenClaw Autodream

Welcome! 🌙

## Quick Links

- **GitHub:** https://github.com/rimaslogic/openclaw-autodream
- **OpenClaw:** https://github.com/openclaw/openclaw
- **Discord:** https://discord.gg/clawd

## How to Contribute

1. **Bugs & small fixes** → Open a PR
2. **New features / architecture changes** → Open an issue first to discuss
3. **Questions** → Open a discussion or ask in Discord

## Before You PR

- Test locally: `npm test`
- Lint: `npx biome check src/ test/ bin/`
- Keep PRs focused (one thing per PR)
- Describe what & why in the PR description
- Ensure zero external runtime dependencies are added (dev dependencies are fine)

## AI/Vibe-Coded PRs Welcome! 🤖

Built with Codex, Claude, or other AI tools? Great — just be transparent:

- [ ] Mark as AI-assisted in the PR title or description
- [ ] Note the degree of testing (untested / lightly tested / fully tested)
- [ ] Include prompts or session logs if possible
- [ ] Confirm you understand what the code does

## Code Style

- JavaScript ESM (`import` / `export`)
- Node.js built-in APIs only (zero runtime dependencies)
- `node:` prefix for built-in modules
- `.js` extensions in relative imports
- Biome for formatting and linting

## Testing

Tests use the Node.js built-in test runner:

```bash
npm test
```

When adding features, add corresponding tests in `test/consolidator.test.js`.
Use temp workspaces for integration tests and clean up in `after()` hooks.

## Changelog

When making user-facing changes, add an entry to `CHANGELOG.md` under the `[Unreleased]` section. Keep entries concise and user-focused — no internal implementation details.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
