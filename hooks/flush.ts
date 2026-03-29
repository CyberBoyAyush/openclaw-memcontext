import type { MemContextClient } from "../client.ts";
import type { MemContextPluginConfig } from "../config.ts";
import { buildContextSnapshot, resolveMemoryProject } from "../lib/memory.ts";
import { log } from "../logger.ts";

export function buildFlushHandler(
  client: MemContextClient,
  config: MemContextPluginConfig,
  getWorkspaceDir: () => string | undefined,
) {
  return async (
    reason: "reset" | "compaction",
    messages: unknown[] | undefined,
  ) => {
    const snapshot = buildContextSnapshot(reason, messages ?? []);
    if (!snapshot) return;

    try {
      await client.saveMemory({
        content: snapshot,
        category: "context",
        project: resolveMemoryProject(config, getWorkspaceDir()),
      });
      log.debug(`flushed ${reason} snapshot`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`flush failed: ${message}`);
    }
  };
}
