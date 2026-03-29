import type { MemoryCategory, MemContextPluginConfig } from "../config.ts";
import { resolveProjectScope } from "../config.ts";

type Role = "user" | "assistant";

type MessageText = {
  role: Role;
  text: string;
};

type DurableCandidate = {
  content: string;
  category: MemoryCategory;
};

const SENSITIVE_PATTERNS = [
  /\b(api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|auth[-_ ]?token|password|passwd|secret|bearer)\b/i,
  /\b(sk|mc|sm)_[a-z0-9_-]{10,}\b/i,
  /https?:\/\/[^\s:@]+:[^\s@]+@/i,
  /-----BEGIN [A-Z ]+PRIVATE KEY-----/i,
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  for (const block of content) {
    if (!isRecord(block)) continue;
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text.trim());
    }
  }

  return parts.filter(Boolean).join("\n");
}

export function extractConversationTexts(messages: unknown[]): MessageText[] {
  const texts: MessageText[] = [];

  for (const message of messages) {
    if (!isRecord(message)) continue;
    if (message.role !== "user" && message.role !== "assistant") continue;

    const text = extractTextContent(message.content);
    if (!text) continue;

    texts.push({ role: message.role, text });
  }

  return texts;
}

export function getLastTurn(messages: unknown[]): MessageText[] {
  const texts = extractConversationTexts(messages);
  let lastUserIndex = -1;

  for (let index = texts.length - 1; index >= 0; index -= 1) {
    if (texts[index]?.role === "user") {
      lastUserIndex = index;
      break;
    }
  }

  return lastUserIndex >= 0 ? texts.slice(lastUserIndex) : texts;
}

export function inferCategory(content: string): MemoryCategory {
  const text = content.toLowerCase();

  if (
    text.includes("prefer") ||
    text.includes("i like") ||
    text.includes("i dislike") ||
    text.includes("always use") ||
    text.includes("never use")
  ) {
    return "preference";
  }

  if (
    text.includes("we decided") ||
    text.includes("decision") ||
    text.includes("we will use") ||
    text.includes("we're going to use") ||
    text.includes("chosen")
  ) {
    return "decision";
  }

  if (
    text.includes("my name is") ||
    text.includes("i am ") ||
    text.includes("project uses") ||
    text.includes("repo uses") ||
    text.includes("domain is")
  ) {
    return "fact";
  }

  return "context";
}

function looksDurable(text: string): boolean {
  const normalized = text.toLowerCase();

  return [
    "remember",
    "note that",
    "prefer",
    "always",
    "never",
    "we decided",
    "we use",
    "project uses",
    "repo uses",
    "my name is",
    "i am ",
  ].some((pattern) => normalized.includes(pattern));
}

function hasExplicitRememberPrefix(text: string): boolean {
  return /^(remember|note)(\s+that)?\b/i.test(text.trim());
}

export function containsSensitiveContent(text: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
}

function redactSensitiveContent(text: string): string {
  return text
    .replace(/\b(sk|mc|sm)_[a-z0-9_-]{10,}\b/gi, "[redacted-token]")
    .replace(
      /https?:\/\/([^\s:@]+):([^\s@]+)@/gi,
      "https://[redacted]:[redacted]@",
    )
    .replace(
      /-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/gi,
      "[redacted-private-key]",
    );
}

function cleanupCandidate(text: string): string {
  return text
    .replace(/^remember\s+(that\s+)?/i, "")
    .replace(/^note\s+(that\s+)?/i, "")
    .trim();
}

export function extractDurableCandidates(
  messages: unknown[],
): DurableCandidate[] {
  const turn = getLastTurn(messages);
  const candidates = new Map<string, DurableCandidate>();

  for (const item of turn) {
    if (item.role !== "user") continue;

    const original = item.text.trim();
    const explicitRemember = hasExplicitRememberPrefix(original);
    const cleaned = cleanupCandidate(original);
    if (cleaned.length < 12) continue;
    if (!explicitRemember && !looksDurable(cleaned)) continue;
    if (containsSensitiveContent(cleaned)) continue;

    candidates.set(cleaned, {
      content: cleaned,
      category: inferCategory(cleaned),
    });
  }

  return [...candidates.values()].slice(0, 3);
}

export function buildContextSnapshot(
  reason: "reset" | "compaction",
  messages: unknown[],
): string | undefined {
  const turn = getLastTurn(messages);
  if (turn.length === 0) return undefined;

  const durableCandidates = extractDurableCandidates(messages);
  const sanitizedAssistantMessage = turn
    .filter((item) => item.role === "assistant")
    .map((item) => redactSensitiveContent(item.text))
    .find((value) => value.trim().length > 0);

  const lines: string[] = [`OpenClaw ${reason} summary:`];

  if (durableCandidates.length > 0) {
    lines.push("", "Durable user facts:");
    for (const candidate of durableCandidates) {
      lines.push(`- ${candidate.content}`);
    }
  }

  if (sanitizedAssistantMessage) {
    lines.push(
      "",
      `Recent assistant context: ${sanitizedAssistantMessage.slice(0, 500)}`,
    );
  }

  const snapshot = lines.join("\n").trim();
  if (!snapshot || snapshot === `OpenClaw ${reason} summary:`) {
    return undefined;
  }

  return snapshot.slice(0, 1500);
}

export function resolveMemoryProject(
  config: MemContextPluginConfig,
  workspaceDir?: string,
): string | undefined {
  return resolveProjectScope(config, workspaceDir);
}

export function formatRelativeDate(value: string): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "";

  const delta = Date.now() - timestamp.getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
