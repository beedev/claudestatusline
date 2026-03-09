# claude-statusline

Claude Code status line showing model, context usage, and Max plan rate limits with progress bars.

```
Sonnet 4.6  in:12.0k out:3.5k  ctx:36% used / 64% left
current ●●○○○○○○○○ 13% ↻ 2:30pm
weekly  ●●●●○○○○○○ 39% ↻ mar 13, 7:30pm
```

**Line 1** — model name, session token counts, context window usage
**Line 2** — current 5-hour rate limit with reset time
**Line 3** — weekly 7-day rate limit with reset time

Colors: green → yellow (50%+) → red (90%+)

---

## Requirements

- [Claude Code](https://claude.ai/code) with a Max plan subscription
- Node.js 18+

---

## Install

```bash
npx claude-statusline
```

Then restart Claude Code.

### Manual install

```bash
git clone https://github.com/beedev/claudestatusline.git
cd claudestatusline
node install.js
```

Then restart Claude Code.

---

## How it works

The installer:
1. Copies `statusline.js` to `~/.claude/statusline.js`
2. Patches `~/.claude/settings.json` with the statusLine command

The statusline script runs on every Claude Code update. It:
- Reads the JSON payload Claude Code sends via stdin (model, context window)
- Retrieves your OAuth token from the system credential store
- Fetches `https://api.anthropic.com/api/oauth/usage` for rate limit data
- Caches the usage response for 60 seconds to avoid hammering the API
- Renders the 3-line output with ANSI colors

### Credential resolution (in order)

| Platform | Method |
|----------|--------|
| All | `~/.claude/.credentials.json` |
| macOS | Keychain (`Claude Code-credentials`) |
| Linux | `secret-tool` |

---

## Uninstall

Remove the statusLine entry from `~/.claude/settings.json` and delete `~/.claude/statusline.js`.
