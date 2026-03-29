---
name: memcontext
description: Use MemContext memory tools to recall prior decisions and store durable user or project facts.
user-invocable: false
metadata:
  {
    "openclaw":
      {
        "emoji": "🧠",
        "requires":
          { "config": ["plugins.entries.openclaw-memcontext.enabled"] },
      },
  }
---

# MemContext

Use this skill when long-term context matters across OpenClaw sessions.

## What MemContext is for

- Recall prior decisions, preferences, facts, and project context.
- Persist durable information that should survive resets, compaction, and future sessions.
- Keep memory focused on stable information, not transient chatter.

## When to search memory

- At the start of a conversation when the user references prior context.
- Before answering questions like "what did we decide", "remember this", "how do I prefer", or "what stack are we using".
- Before making architecture or workflow decisions that might already have been decided.

Use the `memcontext_search` tool for manual lookups when the current prompt context is not enough.

## When to save memory

Use `memcontext_store` immediately when the user shares durable information such as:

- stable preferences or dislikes
- important personal or team facts
- project conventions or architecture decisions
- durable context that will matter in later sessions

Do not save one-off debugging noise, temporary outputs, or generic chit-chat.
Avoid saving secrets, tokens, passwords, credential URLs, or other sensitive data.

## Categories

- `preference` for likes, dislikes, and workflow preferences
- `fact` for durable truths about the user or project
- `decision` for chosen tools, architecture, or conventions
- `context` for important recent background that should survive session boundaries

## Examples

- Save: "User prefers pnpm over npm" -> `preference`
- Save: "This project uses Hono for the API" -> `fact`
- Save: "We chose MemContext as the OpenClaw memory backend" -> `decision`
- Save: "We are currently building the OpenClaw plugin in a separate repository" -> `context`
