import { Type } from "@sinclair/typebox";
import type { MemContextClient } from "../client.ts";
import type { MemContextPluginConfig } from "../config.ts";
import { formatRelativeDate, resolveMemoryProject } from "../lib/memory.ts";

type SearchParams = {
  query: string;
  limit?: number;
  project?: string;
};

export function registerSearchTool(
  api: import("openclaw/plugin-sdk/core").OpenClawPluginApi,
  client: MemContextClient,
  config: MemContextPluginConfig,
  getWorkspaceDir: () => string | undefined,
): void {
  api.registerTool(
    {
      name: "memcontext_search",
      label: "MemContext Search",
      description:
        "Search long-term MemContext memories for relevant prior facts and decisions.",
      parameters: Type.Object({
        query: Type.String({ description: "What memory to search for" }),
        limit: Type.Optional(
          Type.Number({
            description: "Maximum number of results (default: 5)",
          }),
        ),
        project: Type.Optional(
          Type.String({
            description: "Optional MemContext project scope override",
          }),
        ),
      }),
      async execute(_toolCallId: string, params: SearchParams) {
        try {
          const explicitProject = params.project?.trim();
          const outcome = await client.searchMemoriesWithFallback({
            query: params.query,
            limit: params.limit ?? config.maxRecallResults,
            project:
              explicitProject ||
              resolveMemoryProject(config, getWorkspaceDir()),
          });
          const memories = outcome.memories;

          if (memories.length === 0) {
            return {
              content: [{ type: "text", text: "No relevant memories found." }],
              details: { count: 0, memories: [], scope: outcome.scope },
            };
          }

          return {
            content: [
              {
                type: "text",
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
              },
            ],
            details: {
              count: memories.length,
              memories,
              scope: outcome.scope,
            },
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              { type: "text", text: `MemContext search failed: ${message}` },
            ],
            details: { error: message },
          };
        }
      },
    },
    { name: "memcontext_search" },
  );
}
