import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import type { MemContextClient } from "../client.ts";
import {
  DEFAULT_API_URL,
  PLUGIN_ID,
  type MemContextPluginConfig,
} from "../config.ts";
import { resolveMemoryProject } from "../lib/memory.ts";

type CommandLike = {
  command(name: string): CommandLike;
  description(text: string): CommandLike;
  action(handler: () => void | Promise<void>): CommandLike;
};

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requirePlainRecord(
  value: unknown,
  label: string,
): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (isPlainRecord(value)) return value;
  throw new Error(`Invalid OpenClaw config: ${label} must be an object.`);
}

function isCommandLike(value: unknown): value is CommandLike {
  if (!isPlainRecord(value)) return false;
  const record = value;
  return (
    typeof record.command === "function" &&
    typeof record.description === "function" &&
    typeof record.action === "function"
  );
}

function getConfigPath(): string {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function readOpenClawConfig(): Record<string, unknown> {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) return {};

  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<
      string,
      unknown
    >;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse ${configPath}: ${message}`);
  }
}

function writeOpenClawConfig(config: Record<string, unknown>): void {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), {
    mode: 0o600,
  });
  fs.chmodSync(configPath, 0o600);
}

function redactPluginEntry(
  entry: Record<string, unknown>,
): Record<string, unknown> {
  const copy = structuredClone(entry);
  const config =
    copy.config &&
    typeof copy.config === "object" &&
    !Array.isArray(copy.config)
      ? (copy.config as Record<string, unknown>)
      : undefined;

  if (config && typeof config.apiKey === "string" && config.apiKey.length > 0) {
    config.apiKey = config.apiKey.startsWith("${")
      ? config.apiKey
      : `${config.apiKey.slice(0, 4)}...${config.apiKey.slice(-2)}`;
  }

  return copy;
}

async function prompt(question: string, hidden = false): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  }) as readline.Interface & {
    stdoutMuted?: boolean;
    _writeToOutput?: (value: string) => void;
  };

  const originalWrite = rl._writeToOutput?.bind(rl);
  rl.stdoutMuted = hidden;
  if (hidden && originalWrite) {
    rl._writeToOutput = (value: string) => {
      if (value.includes(question)) {
        originalWrite(value);
        return;
      }

      originalWrite("*");
    };
  }

  const answer = await new Promise<string>((resolve) => {
    rl.question(question, resolve);
  });

  if (hidden) {
    process.stdout.write("\n");
  }
  rl.close();
  return answer;
}

function parseBooleanAnswer(value: string, defaultValue: boolean): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (["y", "yes", "true", "1"].includes(normalized)) return true;
  if (["n", "no", "false", "0"].includes(normalized)) return false;
  return defaultValue;
}

export function registerCliCommands(
  api: import("openclaw/plugin-sdk/core").OpenClawPluginApi,
  client?: MemContextClient,
  config?: MemContextPluginConfig,
  getWorkspaceDir?: () => string | undefined,
): void {
  api.registerCli(
    ({ program }) => {
      if (!isCommandLike(program)) {
        return;
      }

      const memcontext = program
        .command("memcontext")
        .description("MemContext memory plugin commands");

      memcontext
        .command("setup")
        .description("Configure the MemContext OpenClaw plugin")
        .action(async () => {
          let openClawConfig: Record<string, unknown>;
          try {
            openClawConfig = readOpenClawConfig();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.log(message);
            console.log(
              "Refusing to overwrite an invalid OpenClaw config file.",
            );
            return;
          }
          let plugins: Record<string, unknown>;
          let entries: Record<string, unknown>;
          let slots: Record<string, unknown>;
          try {
            plugins =
              requirePlainRecord(openClawConfig.plugins, "plugins") ?? {};
            entries =
              requirePlainRecord(plugins.entries, "plugins.entries") ?? {};
            slots = requirePlainRecord(plugins.slots, "plugins.slots") ?? {};
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.log(message);
            console.log(
              "Refusing to overwrite an invalid OpenClaw config structure.",
            );
            return;
          }
          const currentMemorySlot =
            typeof slots.memory === "string" ? slots.memory : undefined;

          if (currentMemorySlot && currentMemorySlot !== PLUGIN_ID) {
            const confirmation = (
              await prompt(
                `Replace current memory plugin \`${currentMemorySlot}\` with \`${PLUGIN_ID}\`? [y/N]: `,
              )
            )
              .trim()
              .toLowerCase();

            if (confirmation !== "y" && confirmation !== "yes") {
              console.log(
                "Setup cancelled. Existing memory plugin was left unchanged.",
              );
              return;
            }
          }

          const existingEntry = entries[PLUGIN_ID];
          const existingConfig =
            isPlainRecord(existingEntry) && isPlainRecord(existingEntry.config)
              ? existingEntry.config
              : undefined;
          const existingAutoRecall =
            existingConfig && typeof existingConfig.autoRecall === "boolean"
              ? existingConfig.autoRecall
              : true;
          const existingAutoCapture =
            existingConfig && typeof existingConfig.autoCapture === "boolean"
              ? existingConfig.autoCapture
              : false;
          const existingProject =
            existingConfig && typeof existingConfig.project === "string"
              ? existingConfig.project
              : undefined;
          const existingProjectStrategy =
            existingConfig && existingConfig.projectStrategy === "config"
              ? "config"
              : existingConfig && existingConfig.projectStrategy === "none"
                ? "none"
                : existingProject
                  ? "config"
                  : "workspace";
          const existingApiKey =
            existingConfig && typeof existingConfig.apiKey === "string"
              ? existingConfig.apiKey
              : undefined;
          const existingApiUrl =
            existingConfig && typeof existingConfig.apiUrl === "string"
              ? existingConfig.apiUrl
              : undefined;

          const apiKeyPrompt = existingApiKey
            ? "MemContext API key (mc_..., leave blank to keep current): "
            : "MemContext API key (mc_...): ";
          const apiKeyInput = (await prompt(apiKeyPrompt, true)).trim();
          const apiKey = apiKeyInput || existingApiKey;
          if (!apiKey) {
            console.log("No API key provided. Setup cancelled.");
            return;
          }

          const apiUrlDefault = existingApiUrl || DEFAULT_API_URL;
          const apiUrlInput = (
            await prompt(`MemContext API URL [${apiUrlDefault}]: `)
          ).trim();
          const projectInput = (
            await prompt(
              "Project scope (optional; leave blank to keep current or use workspace, '-' clears fixed scope): ",
            )
          ).trim();
          const autoCapturePrompt = existingAutoCapture
            ? "Enable automatic memory capture after successful turns? [Y/n]: "
            : "Enable automatic memory capture after successful turns? [y/N]: ";
          const autoCapture = parseBooleanAnswer(
            await prompt(autoCapturePrompt),
            existingAutoCapture,
          );

          const projectConfig =
            projectInput === "-"
              ? { project: undefined, projectStrategy: "workspace" as const }
              : projectInput
                ? { project: projectInput, projectStrategy: "config" as const }
                : existingConfig && existingProjectStrategy === "config"
                  ? {
                      project: existingProject,
                      projectStrategy: existingProjectStrategy,
                    }
                  : existingConfig && existingProjectStrategy === "none"
                    ? {
                        project: undefined,
                        projectStrategy: "none" as const,
                      }
                    : {
                        project: undefined,
                        projectStrategy: "workspace" as const,
                      };

          entries[PLUGIN_ID] = {
            enabled: true,
            config: {
              ...(existingConfig ?? {}),
              apiKey,
              apiUrl: apiUrlInput || apiUrlDefault,
              autoRecall: existingAutoRecall,
              autoCapture,
              ...projectConfig,
            },
          };
          slots.memory = PLUGIN_ID;

          openClawConfig.plugins = {
            ...plugins,
            entries,
            slots,
          };

          writeOpenClawConfig(openClawConfig);
          console.log(`Saved configuration to ${getConfigPath()}`);
          console.log("Stored config file permissions as owner-only (0600).");
          console.log(
            `Auto-capture is ${autoCapture ? "enabled" : "disabled"}.`,
          );
          console.log(
            "Tip: you can replace the saved apiKey with ${MEMCONTEXT_OPENCLAW_API_KEY} to avoid keeping the raw key in config.",
          );
          console.log(
            "Restart OpenClaw to apply changes: openclaw gateway restart",
          );
        });
      if (!client) {
        return;
      }

      memcontext
        .command("status")
        .description("Show current MemContext plugin configuration")
        .action(async () => {
          let config: Record<string, unknown>;
          try {
            config = readOpenClawConfig();
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);
            console.log(message);
            return;
          }
          const plugins =
            (config.plugins as Record<string, unknown> | undefined) ?? {};
          const entries =
            (plugins.entries as Record<string, unknown> | undefined) ?? {};
          const current = entries[PLUGIN_ID] as
            | Record<string, unknown>
            | undefined;

          if (!current) {
            console.log("MemContext is not configured.");
            return;
          }

          console.log(JSON.stringify(redactPluginEntry(current), null, 2));
        });

      memcontext
        .command("search")
        .description("Search MemContext memories from the CLI")
        .action(async () => {
          const query = (await prompt("Search query: ")).trim();
          if (!query) {
            console.log("Search cancelled.");
            return;
          }

          const project =
            config && getWorkspaceDir
              ? resolveMemoryProject(config, getWorkspaceDir())
              : undefined;

          const results = await client.searchMemoriesWithFallback({
            query,
            limit: 5,
            project,
          });
          if (results.memories.length === 0) {
            console.log("No memories found.");
            return;
          }

          for (const [index, result] of results.memories.entries()) {
            console.log(`${index + 1}. ${result.content}`);
          }
        });
    },
    { commands: ["memcontext"] },
  );
}
