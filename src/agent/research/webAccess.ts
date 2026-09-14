/**
 * Phase 9 — Web Access via Tool Abstraction
 * GET, page retrieval, structured extraction, links, metadata, HTTP status, content-type, timestamps
 * Document if unavailable, not fake
 */

import { z } from "zod";
import { PermissionLevel, ToolResultStatus } from "../core/constants";
import { ToolDefinition, makeResult } from "../tools/registry";
import { globalSourceRegistry } from "./source";
import { ResearchSource } from "./types";
import { randomUUID } from "node:crypto";

// Security: SSRF protection, domain allow/block, size limits
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT_MS = 15_000;

function isBlockedUrl(urlStr: string): { blocked: boolean; reason?: string } {
  try {
    const url = new URL(urlStr);
    if (BLOCKED_HOSTS.has(url.hostname)) {
      return { blocked: true, reason: `Blocked host ${url.hostname} — SSRF protection` };
    }
    if (url.hostname.endsWith(".internal") || url.hostname.endsWith(".local")) {
      return { blocked: true, reason: `Blocked internal domain ${url.hostname}` };
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { blocked: true, reason: `Only http/https allowed, got ${url.protocol}` };
    }
    return { blocked: false };
  } catch {
    return { blocked: true, reason: `Invalid URL ${urlStr}` };
  }
}

async function fetchWithLimits(url: string, timeoutMs: number, maxBytes: number): Promise<{
  content: string;
  statusCode: number;
  contentType: string;
  headers: Record<string, string>;
  truncated: boolean;
  bytes: number;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Kaira-Research-Bot/1.0 (+https://kaira.ai/bot)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
    });

    const contentType = response.headers.get("content-type") ?? "text/plain";
    const headers: Record<string, string> = {};
    response.headers.forEach((v, k) => (headers[k] = v));

    // Check content-length header for early rejection
    const contentLengthHeader = response.headers.get("content-length");
    if (contentLengthHeader) {
      const len = parseInt(contentLengthHeader, 10);
      if (len > maxBytes) {
        throw new Error(`Response too large: ${len} bytes > ${maxBytes} limit`);
      }
    }

    // Read with size limit
    const reader = response.body?.getReader();
    let received = 0;
    let chunks: Uint8Array[] = [];
    let truncated = false;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          received += value.length;
          if (received > maxBytes) {
            truncated = true;
            // Take only up to limit
            const remaining = maxBytes - (received - value.length);
            if (remaining > 0) {
              chunks.push(value.slice(0, remaining));
            }
            break;
          }
          chunks.push(value);
        }
      }
    } else {
      const text = await response.text();
      const bytes = new TextEncoder().encode(text).length;
      if (bytes > maxBytes) {
        truncated = true;
        chunks = [new TextEncoder().encode(text.substring(0, maxBytes))];
        received = maxBytes;
      } else {
        chunks = [new TextEncoder().encode(text)];
        received = bytes;
      }
    }

    const combined = new Uint8Array(chunks.reduce((acc, c) => acc + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }
    const content = new TextDecoder().decode(combined);

    return {
      content,
      statusCode: response.status,
      contentType,
      headers,
      truncated,
      bytes: received,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  description: "Fetch a web page via HTTP GET. Returns status, content-type, headers, content (truncated if large), links, metadata, timestamps. Respects SSRF protection, size limits, timeouts. Use for research.",
  inputSchema: z.object({
    url: z.string().url().describe("URL to fetch, http/https only"),
    timeoutMs: z.number().int().min(1000).max(30000).optional().describe("Timeout ms, default 15000"),
    maxBytes: z.number().int().min(1024).max(5 * 1024 * 1024).optional().describe("Max response bytes, default 5MB"),
    extractLinks: z.boolean().optional().describe("Whether to extract links, default true"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "URL to fetch" },
      timeoutMs: { type: "number", description: "Timeout ms" },
      maxBytes: { type: "number", description: "Max bytes" },
      extractLinks: { type: "boolean", description: "Extract links" },
    },
    required: ["url"],
  },
  permissionLevel: PermissionLevel.COMMAND_EXECUTION,
  timeoutMs: 20_000,
  handler: async (input: any, context) => {
    const { url, timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_RESPONSE_BYTES, extractLinks = true } = input;
    const start = Date.now();

    // SSRF check
    const blocked = isBlockedUrl(url);
    if (blocked.blocked) {
      return makeResult({
        tool: "web_fetch",
        input,
        status: ToolResultStatus.FAILURE,
        output: `Blocked URL: ${blocked.reason}`,
        executionTimeMs: Date.now() - start,
        error: blocked.reason,
      });
    }

    // Check if mock adapter handles it (for tests)
    const adapter = globalSourceRegistry.getAdapterForUrl(url);
    if (adapter && adapter.name === "mock") {
      try {
        const fetched = await adapter.fetch(url, { timeoutMs, maxBytes });
        const extracted = await adapter.extract(fetched.content, url);
        return makeResult({
          tool: "web_fetch",
          input,
          status: fetched.statusCode >= 200 && fetched.statusCode < 300 ? ToolResultStatus.SUCCESS : ToolResultStatus.FAILURE,
          output: `Fetched mock ${url} — status ${fetched.statusCode}, ${fetched.content.length} bytes. Excerpt: ${extracted.excerpt.substring(0, 200)}`,
          executionTimeMs: Date.now() - start,
          data: {
            url,
            statusCode: fetched.statusCode,
            contentType: fetched.contentType,
            content: fetched.content.substring(0, maxBytes),
            excerpt: extracted.excerpt,
            links: extracted.links,
            title: extracted.title,
            headers: fetched.headers,
            timestamp: new Date().toISOString(),
            mock: true,
          },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return makeResult({
          tool: "web_fetch",
          input,
          status: ToolResultStatus.FAILURE,
          output: `Mock fetch failed for ${url}: ${msg}`,
          executionTimeMs: Date.now() - start,
          error: msg,
        });
      }
    }

    try {
      const result = await fetchWithLimits(url, timeoutMs, maxBytes);
      let links: string[] = [];
      let title: string | undefined;
      let excerpt = result.content.substring(0, 300);

      if (extractLinks) {
        // Extract links and title
        const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
        let match;
        while ((match = linkRegex.exec(result.content)) !== null) {
          if (links.length < 50) links.push(match[1]);
        }
        const titleMatch = result.content.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = titleMatch[1].trim();

        // Simple excerpt from text content
        const textOnly = result.content
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        excerpt = textOnly.substring(0, 500);
      }

      const isSuccess = result.statusCode >= 200 && result.statusCode < 300;

      return makeResult({
        tool: "web_fetch",
        input,
        status: isSuccess ? ToolResultStatus.SUCCESS : ToolResultStatus.FAILURE,
        output: `Fetched ${url} — status ${result.statusCode}, type ${result.contentType}, ${result.bytes} bytes${result.truncated ? " (truncated)" : ""}. Title: ${title ?? "N/A"}. Excerpt: ${excerpt.substring(0, 200)}`,
        executionTimeMs: Date.now() - start,
        data: {
          url,
          statusCode: result.statusCode,
          contentType: result.contentType,
          contentLength: result.bytes,
          truncated: result.truncated,
          content: result.content.substring(0, Math.min(maxBytes, 100_000)), // limit data returned
          excerpt,
          links,
          title,
          headers: result.headers,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isTimeout = msg.includes("abort") || msg.toLowerCase().includes("timeout");
      return makeResult({
        tool: "web_fetch",
        input,
        status: isTimeout ? ToolResultStatus.TIMEOUT : ToolResultStatus.FAILURE,
        output: `Failed to fetch ${url}: ${msg}`,
        executionTimeMs: Date.now() - start,
        error: msg,
      });
    }
  },
};

export const webSearchMockTool: ToolDefinition = {
  name: "web_search",
  description: "Search for information (mock implementation for testing, returns structured results). In production, integrates with approved search API. Returns normalized observations with provenance.",
  inputSchema: z.object({
    query: z.string().min(1).describe("Search query"),
    maxResults: z.number().int().min(1).max(20).optional().describe("Max results, default 5"),
  }),
  jsonSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query" },
      maxResults: { type: "number", description: "Max results" },
    },
    required: ["query"],
  },
  permissionLevel: PermissionLevel.READ_ONLY,
  timeoutMs: 10_000,
  handler: async (input: any) => {
    const { query, maxResults = 5 } = input;
    const start = Date.now();

    // Mock search results — in real implementation would call approved API
    // For Phase 9 we document as mock, not fake browsing
    const mockResults = Array.from({ length: maxResults }, (_, i) => ({
      url: `mock://search/${encodeURIComponent(query)}/${i}`,
      title: `Result ${i + 1} for "${query}"`,
      excerpt: `This is mock search result ${i + 1} for query "${query}". Contains relevant information about the topic. Retrieved from mock source for testing.`,
      sourceType: "MOCK" as const,
      score: 1 - i * 0.1,
    }));

    return makeResult({
      tool: "web_search",
      input,
      status: ToolResultStatus.SUCCESS,
      output: `Search for "${query}" returned ${mockResults.length} results (mock). Top: ${mockResults[0].title}`,
      executionTimeMs: Date.now() - start,
      data: {
        query,
        results: mockResults,
        timestamp: new Date().toISOString(),
        mock: true,
        note: "This is mock search for testing. Production would use approved search API.",
      },
    });
  },
};

// Register tools
export function registerWebTools(registry: any) {
  registry.register(webFetchTool);
  registry.register(webSearchMockTool);
}
