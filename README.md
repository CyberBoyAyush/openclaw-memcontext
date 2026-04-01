# OpenClaw MemContext

OpenClaw memory plugin backed by MemContext.in.

It connects OpenClaw to the hosted MemContext product:

- app: `https://app.memcontext.in`
- api: `https://api.memcontext.in`

The plugin gives OpenClaw persistent memory across sessions with:

- automatic recall before relevant user turns
- manual save and recall commands in chat
- optional automatic capture after successful turns
- project-aware memory with global fallback

## Quick Start

1. Create an API key in `https://app.memcontext.in`
2. Install the plugin:

```bash
openclaw plugins install openclaw-memcontext
```

3. Run setup:

```bash
openclaw memcontext setup
```

4. Restart OpenClaw:

```bash
openclaw gateway restart
```

5. Test it in chat:

```text
/remember I prefer pnpm over npm.
/recall pnpm
```

## What It Does

- searches MemContext before user turns and injects relevant memory silently
- stores memories with `source: "openclaw"`
- supports `/remember` and `/recall` in chat
- exposes `memcontext_store` and `memcontext_search` tools
- supports optional automatic capture of durable facts after successful turns
- supports project-aware recall with global fallback when project search is empty

## Install

### Published package

```bash
openclaw plugins install openclaw-memcontext
```

### Local development link

```bash
openclaw plugins install -l /Users/ayush/Coding/WebSite/openclaw-memcontext
```

The published npm package is `openclaw-memcontext`.

After installing, run setup and then restart the gateway.

## Setup

Use the interactive setup command:

```bash
openclaw memcontext setup
```

It will:

1. ask for your MemContext API key
2. confirm the API URL, defaulting to `https://api.memcontext.in`
3. optionally ask for a fixed project scope
4. ask whether to enable automatic capture after successful turns
5. write config to `~/.openclaw/openclaw.json`
6. set the OpenClaw memory slot to `openclaw-memcontext`

Project scope behavior during setup:

- enter a value -> store that fixed project with `projectStrategy: "config"`
- leave it blank on first setup -> use `projectStrategy: "workspace"`
- leave it blank on rerun -> keep the existing project behavior
- enter `-` -> clear the fixed project and switch back to workspace-derived scope

That includes legacy configurations which may already be using `projectStrategy: "none"`.

Auto-capture behavior during setup:

- first-time setup defaults to off unless you enable it
- rerunning setup preserves the current auto-capture setting unless you change it

API key and API URL behavior during setup:

- on first setup, you must provide an API key
- on rerun, leaving the API key blank keeps the current stored key
- leaving the API URL blank keeps the current URL, or the default hosted URL if none is stored

OpenClaw derives workspace scope from the workspace name when `projectStrategy` is `"workspace"`.

## Auto-Recall And Auto-Capture

### Auto-recall

`autoRecall` is on by default.

Before a normal user turn, the plugin searches memory like this:

1. if a project is resolved, search that project first
2. if nothing is found, retry globally
3. if no project is resolved, search globally directly

The recalled memories are injected silently into the prompt.

### Auto-capture

`autoCapture` is optional and disabled by default unless you enable it during setup.

If enabled, after a successful turn the plugin:

1. inspects the last user turn
2. extracts durable candidates like preferences, facts, and decisions
3. skips likely secrets and noisy content
4. saves the extracted memories to MemContext

This is not full transcript dumping. It is filtered capture.

If you want to change it later, update `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "entries": {
      "openclaw-memcontext": {
        "config": {
          "autoCapture": true
        }
      }
    }
  }
}
```

Then restart:

```bash
openclaw gateway restart
```

## Manual Configuration

You usually do not need to edit config manually, but a typical configuration looks like this:

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

## Chat Commands

- `/remember <text>`: explicitly store a memory
- `/recall <query>`: explicitly search memories

Examples:

```text
/remember I prefer pnpm over npm.
/recall pnpm
```

## CLI Commands

```bash
openclaw memcontext setup
openclaw memcontext status
openclaw memcontext search
```

`openclaw memcontext search` is interactive and will prompt for the query.

## How Memory Search Works

The plugin uses project-aware search semantics:

- if a project is resolved or configured, search that project first
- if no memory is found there, retry globally
- if no project is resolved, search globally directly

This helps keep project context relevant while still recovering useful global memories.

## How To Verify It Works

### Explicit save and recall

In chat:

```text
/remember I prefer pnpm over npm.
/recall pnpm
```

Expected:

- `/remember` returns `saved`, `updated`, `extended`, or `duplicate`
- `/recall` returns relevant memory results

### Automatic recall

1. save a memory with `/remember`
2. start a new session with `/new`
3. ask a natural question like:

```text
What package manager do I usually prefer?
```

Expected:

- OpenClaw answers using the saved memory without needing `/recall`

### Automatic capture

If `autoCapture` is enabled, try:

```text
Remember that we use pnpm for this repo.
```

Then start a new session and ask:

```text
What package manager do we use in this repo?
```

Expected:

- OpenClaw recalls the saved fact in the next session

## Environment Variables

The plugin resolves credentials in this order:

1. `MEMCONTEXT_OPENCLAW_API_KEY`
2. `MEMCONTEXT_API_KEY`
3. `apiKey` in `~/.openclaw/openclaw.json`

Optional:

- `MEMCONTEXT_API_URL`

Security notes:

- setup writes `~/.openclaw/openclaw.json` with `0600` permissions
- `openclaw memcontext status` redacts the API key
- if you prefer env-based auth, replace the stored key with `${MEMCONTEXT_OPENCLAW_API_KEY}`

## Update

If installed from npm:

```bash
openclaw plugins update openclaw-memcontext
openclaw gateway restart
```

Or update all plugins:

```bash
openclaw plugins update --all
openclaw gateway restart
```

If installed from a local path, OpenClaw uses your local checkout directly. Restart the gateway after local changes.

## Troubleshooting

### Plugin loads but does not work

Run:

```bash
openclaw memcontext status
```

Confirm:

- the plugin is enabled
- the API URL is correct
- the API key is present and redacted

### Recall is not finding anything

- verify the memory was actually saved with `/remember`
- test with `/recall <query>` first
- enable `debug: true` if needed
- remember that auto-recall runs before relevant user turns, not as a visible command

### Auto-capture is not saving enough

- enable `autoCapture`
- use phrasing that expresses durable facts, preferences, and decisions clearly
- remember that auto-capture intentionally filters noise and likely secrets

### Wrong project scope

- set a fixed `project` during setup if you want one stable scope
- otherwise leave project blank and let the plugin derive scope from the workspace

## Notes

- plugin runtime is local to OpenClaw; only MemContext is hosted
- MemContext API calls use standard HTTPS with `X-API-Key`
- saved memories from this plugin use `source: "openclaw"`
