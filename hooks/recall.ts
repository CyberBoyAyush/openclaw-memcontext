import type { MemContextClient, MemorySearchResult } from "../client.ts";
import type { MemContextPluginConfig } from "../config.ts";
import { formatRelativeDate, resolveMemoryProject } from "../lib/memory.ts";
import { log } from "../logger.ts";

function formatMemoryLine(memory: MemorySearchResult): string {
  const tags = [
    memory.category ? `category=${memory.category}` : undefined,
    memory.project ? `project=${memory.project}` : undefined,
    `${Math.round(memory.relevance * 100)}%`,
    formatRelativeDate(memory.createdAt),
  ].filter(Boolean);

  return `- ${memory.content} [${tags.join(" | ")}]`;
}

function dedupeMemories(memories: MemorySearchResult[]): MemorySearchResult[] {
  const seen = new Set<string>();
  const unique: MemorySearchResult[] = [];

  for (const memory of memories) {
    const key = `${memory.id}:${memory.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(memory);
  }

  return unique;
}

function buildRecallContext(memories: MemorySearchResult[]): string {
  const header = [
    "<memcontext-memory>",
    "Use these recalled long-term memories silently unless the user is directly asking about them.",
    "",
    "## Relevant Memories",
  ];
  const footer = [
    "",
    "Do not mention that memory was searched unless the user asks.",
    "</memcontext-memory>",
  ];
  const maxCharacters = 1800;
  const lines = [...header];

  for (const memory of memories) {
    const line = formatMemoryLine(memory);
    const nextBlock = [...lines, line, ...footer].join("\n");
    if (nextBlock.length > maxCharacters) {
      break;
    }
    lines.push(line);
  }

  return [...lines, ...footer].join("\n");
}

export function buildRecallHandler(
  client: MemContextClient,
  config: MemContextPluginConfig,
  getWorkspaceDir: () => string | undefined,
) {
  return async (
    event: { prompt: string; messages: unknown[] },
    ctx: { trigger?: string },
  ) => {
    if (ctx.trigger && ctx.trigger !== "user") return;
    if (!event.prompt || event.prompt.trim().length < 4) return;

    const project = resolveMemoryProject(config, getWorkspaceDir());

    try {
      const outcome = await client.searchMemoriesWithFallback({
        query: event.prompt,
        limit: config.maxRecallResults,
        project,
      });
      const memories = dedupeMemories(outcome.memories);

      if (memories.length === 0) {
        return;
      }

      const context = buildRecallContext(memories);

      log.debug(`recalled ${memories.length} memories (${outcome.scope})`);
      return { prependContext: context };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`recall failed: ${message}`);
      return;
    }
  };
}
