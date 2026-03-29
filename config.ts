import { basename } from "node:path";

export const PLUGIN_ID = "openclaw-memcontext";
export const PLUGIN_NAME = "MemContext";
export const DEFAULT_API_URL = "https://api.memcontext.in";
export const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

export type MemoryCategory = "preference" | "fact" | "decision" | "context";
export type ProjectStrategy = "workspace" | "config" | "none";

export type MemContextPluginConfig = {
  apiKey: string | undefined;
  apiUrl: string;
  project?: string;
  projectStrategy: ProjectStrategy;
  autoRecall: boolean;
  autoCapture: boolean;
  maxRecallResults: number;
  flushOnReset: boolean;
  flushOnCompaction: boolean;
  requestTimeoutMs: number;
  debug: boolean;
};

const ALLOWED_KEYS = new Set([
  "apiKey",
  "apiUrl",
  "project",
  "projectStrategy",
  "autoRecall",
  "autoCapture",
  "maxRecallResults",
  "flushOnReset",
  "flushOnCompaction",
  "requestTimeoutMs",
  "debug",
]);

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, envVar: string) => {
    const resolved = process.env[envVar];
    if (!resolved) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return resolved;
  });
}

function normalizeProjectName(raw: string): string | undefined {
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || undefined;
}

export function deriveWorkspaceProject(
  workspaceDir?: string,
): string | undefined {
  if (!workspaceDir) return undefined;
  return normalizeProjectName(basename(workspaceDir));
}

export function resolveProjectScope(
  config: MemContextPluginConfig,
  workspaceDir?: string,
): string | undefined {
  if (config.projectStrategy === "none") {
    return undefined;
  }

  if (config.projectStrategy === "config") {
    return config.project;
  }

  return deriveWorkspaceProject(workspaceDir) ?? config.project;
}

export function parseConfig(raw: unknown): MemContextPluginConfig {
  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const unknownKeys = Object.keys(input).filter(
    (key) => !ALLOWED_KEYS.has(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `memcontext config has unknown keys: ${unknownKeys.join(", ")}`,
    );
  }

  let apiKey: string | undefined;
  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    apiKey = resolveEnvVars(input.apiKey.trim());
  } else {
    apiKey =
      process.env.MEMCONTEXT_OPENCLAW_API_KEY ?? process.env.MEMCONTEXT_API_KEY;
  }

  const projectStrategyValue =
    input.projectStrategy === "config" || input.projectStrategy === "none"
      ? input.projectStrategy
      : "workspace";

  const maxRecallResults =
    typeof input.maxRecallResults === "number" &&
    Number.isFinite(input.maxRecallResults)
      ? Math.min(10, Math.max(1, Math.floor(input.maxRecallResults)))
      : 5;

  const requestTimeoutMs =
    typeof input.requestTimeoutMs === "number" &&
    Number.isFinite(input.requestTimeoutMs)
      ? Math.min(30000, Math.max(1000, Math.floor(input.requestTimeoutMs)))
      : DEFAULT_REQUEST_TIMEOUT_MS;

  return {
    apiKey,
    apiUrl:
      typeof input.apiUrl === "string" && input.apiUrl.trim()
        ? resolveEnvVars(input.apiUrl.trim())
        : (process.env.MEMCONTEXT_API_URL ?? DEFAULT_API_URL),
    project:
      typeof input.project === "string"
        ? normalizeProjectName(input.project)
        : undefined,
    projectStrategy: projectStrategyValue,
    autoRecall: input.autoRecall === false ? false : true,
    autoCapture: input.autoCapture === true,
    maxRecallResults,
    flushOnReset: input.flushOnReset === true,
    flushOnCompaction: input.flushOnCompaction === true,
    requestTimeoutMs,
    debug: input.debug === true,
  };
}

export const memContextConfigSchema = {
  jsonSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      apiKey: { type: "string" },
      apiUrl: { type: "string" },
      project: { type: "string" },
      projectStrategy: {
        type: "string",
        enum: ["workspace", "config", "none"],
      },
      autoRecall: { type: "boolean" },
      autoCapture: { type: "boolean" },
      maxRecallResults: { type: "number", minimum: 1, maximum: 10 },
      flushOnReset: { type: "boolean" },
      flushOnCompaction: { type: "boolean" },
      requestTimeoutMs: { type: "number", minimum: 1000, maximum: 30000 },
      debug: { type: "boolean" },
    },
  },
  parse: parseConfig,
};
