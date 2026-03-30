# OpenClaw MemContext Plugin

Hosted long-term memory for OpenClaw backed by the MemContext API at `https://api.memcontext.in`.

This plugin follows the official OpenClaw native plugin model:

- native plugin discovered through `openclaw.plugin.json`
- installed from npm, a local path, or a tarball
- loaded in-process by OpenClaw
- hooks for recall and capture
- bundled skill shipped through `openclaw.plugin.json` `skills`

It also uses the Supermemory OpenClaw plugin as a structural reference for:

- npm-distributed memory plugin packaging
- auto-recall before prompt build
- auto-capture after successful turns
- slash commands and CLI setup flow

## What it does

- searches MemContext before user turns and injects relevant memories
- can save filtered durable user and project facts after successful turns when `autoCapture` is enabled
- can persist a filtered session summary before reset and compaction when explicitly enabled
- exposes `memcontext_search` and `memcontext_store` tools
- exposes `/remember` and `/recall` commands
- ships a `memcontext` skill in `skills/memcontext/SKILL.md`

## Install

### Local development link

```bash
openclaw plugins install -l /Users/ayush/Coding/WebSite/openclaw-memcontext
openclaw gateway restart
```

### Published package

```bash
openclaw plugins install openclaw-memcontext
openclaw gateway restart
```

You can also force npm resolution explicitly:

```bash
openclaw plugins install npm:openclaw-memcontext
```

## Configure

Run:

```bash
openclaw memcontext setup
```

Or configure `~/.openclaw/openclaw.json` manually:

```json
{
  "plugins": {
    "slots": {
      "memory": "openclaw-memcontext"
    },
    "entries": {
      "openclaw-memcontext": {
        "enabled": true,
        "config": {
          "apiKey": "${MEMCONTEXT_OPENCLAW_API_KEY}",
          "apiUrl": "https://api.memcontext.in",
          "projectStrategy": "workspace",
          "autoRecall": true,
          "autoCapture": false,
          "maxRecallResults": 5,
          "flushOnReset": false,
          "flushOnCompaction": false,
          "requestTimeoutMs": 8000,
          "debug": false
        }
      }
    }
  }
}
```

## Environment variables

- `MEMCONTEXT_OPENCLAW_API_KEY`
- `MEMCONTEXT_API_KEY`
- `MEMCONTEXT_API_URL`

The CLI setup writes `~/.openclaw/openclaw.json` with owner-only permissions and redacts the API key in `openclaw memcontext status`. If you prefer, replace the stored key with `${MEMCONTEXT_OPENCLAW_API_KEY}`.

## Update flow

If installed from a linked local path, OpenClaw uses your local checkout. Restart the gateway after changes.

If installed from npm, publish a new package version and update with:

```bash
openclaw plugins update openclaw-memcontext
```

Or:

```bash
openclaw plugins update --all
```

## Notes

- plugin runtime is local to OpenClaw; only the MemContext API is hosted
- MemContext calls are standard HTTPS requests with `X-API-Key`
- memories saved by this plugin use `source: "openclaw"`
- `autoCapture`, `flushOnReset`, and `flushOnCompaction` are opt-in and disabled by default for safer persistence
