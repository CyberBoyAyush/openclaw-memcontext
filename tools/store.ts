import { Type } from "@sinclair/typebox";
import type { MemContextClient } from "../client.ts";
import type { MemContextPluginConfig, MemoryCategory } from "../config.ts";
import {
  containsSensitiveContent,
  inferCategory,
  resolveMemoryProject,
} from "../lib/memory.ts";

type StoreParams = {
  content: string;
  category?: MemoryCategory;
  project?: string;
};

const CATEGORY_VALUES: MemoryCategory[] = [
  "preference",
  "fact",
  "decision",
  "context",
];

export function registerStoreTool(
  api: import("openclaw/plugin-sdk/core").OpenClawPluginApi,
  client: MemContextClient,
  config: MemContextPluginConfig,
  getWorkspaceDir: () => string | undefined,
): void {
  api.registerTool(
    {
      name: "memcontext_store",
      label: "MemContext Store",
      description:
        "Store a durable fact, preference, decision, or context item in MemContext.",
      parameters: Type.Object({
        content: Type.String({ description: "What should be remembered" }),
        category: Type.Optional(
          Type.Unsafe<MemoryCategory>({
            type: "string",
            enum: CATEGORY_VALUES,
          }),
        ),
        project: Type.Optional(
          Type.String({
            description: "Optional MemContext project scope override",
          }),
        ),
      }),
      async execute(_toolCallId: string, params: StoreParams) {
        if (containsSensitiveContent(params.content)) {
          return {
            content: [
              {
                type: "text",
                text: "Refusing to store content that appears to contain secrets or credentials.",
              },
            ],
            details: { blocked: true },
          };
        }

        try {
          const category = params.category ?? inferCategory(params.content);
          const result = await client.saveMemory({
            content: params.content,
            category,
            project:
              params.project ?? resolveMemoryProject(config, getWorkspaceDir()),
          });

          return {
            content: [
              {
                type: "text",
                text: `Saved memory (${result.status}): ${params.content}`,
              },
            ],
            details: result,
          };
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            content: [
              { type: "text", text: `MemContext store failed: ${message}` },
            ],
            details: { error: message },
          };
        }
      },
    },
    { name: "memcontext_store" },
  );
}
