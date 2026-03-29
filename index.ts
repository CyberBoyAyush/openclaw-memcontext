import type { OpenClawPluginApi } from "openclaw/plugin-sdk/core";
import { registerCliCommands } from "./commands/cli.ts";
import { registerCommands, registerStubCommands } from "./commands/slash.ts";
import { MemContextClient } from "./client.ts";
import {
  memContextConfigSchema,
  parseConfig,
  PLUGIN_ID,
  PLUGIN_NAME,
} from "./config.ts";
import { buildCaptureHandler } from "./hooks/capture.ts";
import { buildFlushHandler } from "./hooks/flush.ts";
import { buildRecallHandler } from "./hooks/recall.ts";
import { initLogger } from "./logger.ts";
import { registerSearchTool } from "./tools/search.ts";
import { registerStoreTool } from "./tools/store.ts";

const plugin = {
  id: PLUGIN_ID,
  name: PLUGIN_NAME,
  description: "OpenClaw memory plugin backed by the hosted MemContext API",
  kind: "memory",
  configSchema: memContextConfigSchema,
  register(api: OpenClawPluginApi) {
    const config = parseConfig(api.pluginConfig);
    initLogger(api.logger, config.debug);

    if (!config.apiKey) {
      registerCliCommands(api);
      api.logger.info(
        "[memcontext] not configured - run `openclaw memcontext setup`",
      );
      registerStubCommands(api);
      return;
    }

    const client = new MemContextClient({
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      requestTimeoutMs: config.requestTimeoutMs,
    });

    const state: {
      workspaceDir?: string;
    } = {};

    const setContext = (ctx: { workspaceDir?: string }): void => {
      if (ctx.workspaceDir) state.workspaceDir = ctx.workspaceDir;
    };

    const getWorkspaceDir = () => state.workspaceDir;

    registerSearchTool(api, client, config, getWorkspaceDir);
    registerStoreTool(api, client, config, getWorkspaceDir);
    registerCommands(api, client, config, getWorkspaceDir);
    registerCliCommands(api, client);

    if (config.autoRecall) {
      const recall = buildRecallHandler(client, config, getWorkspaceDir);
      api.on("before_prompt_build", async (event, ctx) => {
        setContext(ctx);
        return recall(event, ctx);
      });
    }

    if (config.autoCapture) {
      const capture = buildCaptureHandler(client, config, getWorkspaceDir);
      api.on("agent_end", async (event, ctx) => {
        setContext(ctx);
        await capture(event, ctx);
      });
    }

    const flush = buildFlushHandler(client, config, getWorkspaceDir);

    if (config.flushOnCompaction) {
      api.on("before_compaction", async (event, ctx) => {
        setContext(ctx);
        await flush("compaction", event.messages);
      });
    }

    if (config.flushOnReset) {
      api.on("before_reset", async (event, ctx) => {
        setContext(ctx);
        await flush("reset", event.messages);
      });
    }

    api.on("gateway_start", (event) => {
      api.logger.info(
        `[memcontext] gateway started on port ${event.port}; using ${config.apiUrl}`,
      );
    });

    api.registerService({
      id: PLUGIN_ID,
      start() {
        api.logger.info(`[memcontext] connected to ${config.apiUrl}`);
      },
      stop() {
        api.logger.info("[memcontext] stopped");
      },
    });
  },
};

export default plugin;
