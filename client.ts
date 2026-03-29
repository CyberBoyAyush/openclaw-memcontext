import type { MemoryCategory } from "./config.ts";
import { log } from "./logger.ts";

export type SaveMemoryStatus =
  | "saved"
  | "updated"
  | "extended"
  | "duplicate"
  | "limit_exceeded";

export type SaveMemoryResponse = {
  id: string;
  status: SaveMemoryStatus;
  superseded?: string;
  existingId?: string;
};

export type MemorySearchResult = {
  id: string;
  content: string;
  category?: MemoryCategory;
  project?: string;
  relevance: number;
  createdAt: string;
};

type SearchMemoryResponse = {
  found: number;
  memories: MemorySearchResult[];
};

type ApiError = {
  error?: string;
  message?: string;
};

export type MemContextClientConfig = {
  apiUrl: string;
  apiKey: string;
  requestTimeoutMs: number;
};

type SaveMemoryInput = {
  content: string;
  category?: MemoryCategory;
  project?: string;
};

type SearchMemoryInput = {
  query: string;
  limit?: number;
  category?: MemoryCategory;
  project?: string;
};

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    return (
      body.error ?? body.message ?? `${response.status} ${response.statusText}`
    );
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

export class MemContextClient {
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;

  constructor(config: MemContextClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.requestTimeoutMs = config.requestTimeoutMs;
  }

  private async request(
    input: string | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      this.requestTimeoutMs,
    );

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error(
          `MemContext request timed out after ${this.requestTimeoutMs}ms`,
        );
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async saveMemory(input: SaveMemoryInput): Promise<SaveMemoryResponse> {
    log.debug(`save memory (${input.category ?? "context"})`);

    const response = await this.request(`${this.apiUrl}/api/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      },
      body: JSON.stringify({
        ...input,
        source: "openclaw",
      }),
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    return (await response.json()) as SaveMemoryResponse;
  }

  async searchMemories(
    input: SearchMemoryInput,
  ): Promise<MemorySearchResult[]> {
    const url = new URL(`${this.apiUrl}/api/memories/search`);
    url.searchParams.set("query", input.query);
    url.searchParams.set("limit", String(input.limit ?? 5));
    if (input.category) url.searchParams.set("category", input.category);
    if (input.project) url.searchParams.set("project", input.project);

    log.debug(`search memories (${input.query.slice(0, 80)})`);

    const response = await this.request(url, {
      headers: {
        "X-API-Key": this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(await parseError(response));
    }

    const payload = (await response.json()) as SearchMemoryResponse;
    return payload.memories;
  }
}
