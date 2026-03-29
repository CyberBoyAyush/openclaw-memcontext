import type { MemContextClient } from "../client.ts";
import type { MemContextPluginConfig } from "../config.ts";
import {
  containsSensitiveContent,
  inferCategory,
  resolveMemoryProject,
} from "../lib/memory.ts";
import { formatRelativeDate } from "../lib/memory.ts";
import { log } from "../logger.ts";

type CommandApi = import("openclaw/plugin-sdk/core").OpenClawPluginApi;

export function registerStubCommands(api: CommandApi): void {
  api.registerCommand({
    name: "remember",
    description: "Save something to MemContext memory",
    acceptsArgs: true,
    requireAuth: true,
    handler: async () => ({
      text: "MemContext is not configured. Run `openclaw memcontext setup` first.",
    }),
  });

  api.registerCommand({
    name: "recall",
    description: "Search MemContext memories",
    acceptsArgs: true,
    requireAuth: true,
    handler: async () => ({
      text: "MemContext is not configured. Run `openclaw memcontext setup` first.",
    }),
  });
}

export function registerCommands(
  api: CommandApi,
  client: MemContextClient,
  config: MemContextPluginConfig,
  getWorkspaceDir: () => string | undefined,
): void {
  api.registerCommand({
    name: "remember",
    description: "Save something durable to MemContext",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const content = ctx.args?.trim();
      if (!content) {
        return { text: "Usage: /remember <text to remember>" };
      }

      if (containsSensitiveContent(content)) {
        return {
          text: "Refusing to store content that appears to contain secrets or credentials.",
        };
      }

      try {
        const result = await client.saveMemory({
          content,
          category: inferCategory(content),
          project: resolveMemoryProject(config, getWorkspaceDir()),
        });

        return { text: `Remembered (${result.status}): ${content}` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`/remember failed: ${message}`);
        return { text: `Failed to save memory: ${message}` };
      }
    },
  });

  api.registerCommand({
    name: "recall",
    description: "Search MemContext memories",
    acceptsArgs: true,
    requireAuth: true,
    handler: async (ctx) => {
      const query = ctx.args?.trim();
      if (!query) {
        return { text: "Usage: /recall <query>" };
      }

      try {
        const memories = await client.searchMemories({
          query,
          limit: config.maxRecallResults,
          project: resolveMemoryProject(config, getWorkspaceDir()),
        });

        if (memories.length === 0) {
          return { text: `No memories found for: ${query}` };
        }

        return {
          text: memories
            .map((memory, index) => {
              const meta = [
                memory.category ?? "context",
                memory.project,
                `${Math.round(memory.relevance * 100)}%`,
                formatRelativeDate(memory.createdAt),
              ]
                .filter(Boolean)
                .join(" | ");

              return `${index + 1}. ${memory.content} [${meta}]`;
            })
            .join("\n"),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`/recall failed: ${message}`);
        return { text: `Failed to search memories: ${message}` };
      }
    },
  });
}
