import type { MemContextClient } from "../client.ts";
import type { MemContextPluginConfig } from "../config.ts";
import {
  extractDurableCandidates,
  resolveMemoryProject,
} from "../lib/memory.ts";
import { log } from "../logger.ts";

const SKIPPED_TRIGGERS = new Set(["heartbeat", "cron", "memory"]);

export function buildCaptureHandler(
  client: MemContextClient,
  config: MemContextPluginConfig,
  getWorkspaceDir: () => string | undefined,
) {
  return async (
    event: { messages: unknown[]; success: boolean },
    ctx: { trigger?: string },
  ) => {
    if (!event.success) return;
    if (ctx.trigger && SKIPPED_TRIGGERS.has(ctx.trigger)) return;

    const candidates = extractDurableCandidates(event.messages);
    if (candidates.length === 0) return;

    const project = resolveMemoryProject(config, getWorkspaceDir());

    for (const candidate of candidates) {
      try {
        await client.saveMemory({
          content: candidate.content,
          category: candidate.category,
          project,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`capture failed: ${message}`);
      }
    }
  };
}
