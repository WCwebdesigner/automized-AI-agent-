/**
 * Phase 9 — Extensible Source Architecture
 * Adapters for web pages, APIs, RSS, docs, GitHub, approved services
 * Normalized observations, raw not authoritative
 */

import { ResearchSource, SourceType, ResearchObservation } from "./types";
import { randomUUID } from "node:crypto";

export interface SourceAdapter {
  name: string;
  supportedTypes: SourceType[];
  canHandle(url: string): boolean;
  fetch(url: string, options?: { timeoutMs?: number; maxBytes?: number }): Promise<{
    content: string;
    statusCode: number;
    contentType: string;
    headers: Record<string, string>;
    metadata: Record<string, unknown>;
  }>;
  extract(content: string, url: string): Promise<{
    observations: ResearchObservation[];
    links: string[];
    excerpt: string;
    title?: string;
  }>;
}

export interface NormalizedObservation {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sourceType: SourceType;
  content: string;
  normalized: string;
  timestamp: string;
  metadata: Record<string, unknown>;
}

export class BaseSourceAdapter implements SourceAdapter {
  name = "base";
  supportedTypes: SourceType[] = ["WEB_PAGE"];

  canHandle(url: string): boolean {
    return url.startsWith("http://") || url.startsWith("https://");
  }

  async fetch(url: string, options?: { timeoutMs?: number; maxBytes?: number }): Promise<{
    content: string;
    statusCode: number;
    contentType: string;
    headers: Record<string, string>;
    metadata: Record<string, unknown>;
  }> {
    // This will be overridden by WebAccessTool, but provide fallback for tests
    throw new Error(`Fetch not implemented for ${url}, use WebAccessTool`);
  }

  async extract(content: string, url: string) {
    // Simple extraction — strip HTML tags, extract links
    const textContent = content
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 10000);

    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    const links: string[] = [];
    let match;
    while ((match = linkRegex.exec(content)) !== null) {
      links.push(match[1]);
    }

    const titleMatch = content.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : undefined;

    return {
      observations: [
        {
          id: randomUUID(),
          sourceId: "",
          observation: textContent.substring(0, 500),
          normalized: textContent.substring(0, 1000),
          timestamp: new Date().toISOString(),
        },
      ],
      links: links.slice(0, 20),
      excerpt: textContent.substring(0, 300),
      title,
    };
  }
}

export class MockSourceAdapter implements SourceAdapter {
  name = "mock";
  supportedTypes: SourceType[] = ["MOCK", "WEB_PAGE", "API", "DOCUMENTATION"];
  private mockData: Map<string, { content: string; statusCode: number; contentType: string }>;

  constructor(mockData?: Map<string, { content: string; statusCode: number; contentType: string }>) {
    this.mockData = mockData ?? new Map();
  }

  setMockData(url: string, data: { content: string; statusCode: number; contentType: string }) {
    this.mockData.set(url, data);
  }

  canHandle(url: string): boolean {
    return url.startsWith("mock://") || this.mockData.has(url);
  }

  async fetch(url: string) {
    const data = this.mockData.get(url);
    if (!data) {
      // For mock:// URLs, generate generic content
      if (url.startsWith("mock://")) {
        return {
          content: `<html><title>Mock Page for ${url}</title><body>Content for ${url}. This is mock data for testing research capabilities.</body></html>`,
          statusCode: 200,
          contentType: "text/html",
          headers: {},
          metadata: { mock: true },
        };
      }
      throw new Error(`Mock data not found for ${url}`);
    }
    return {
      content: data.content,
      statusCode: data.statusCode,
      contentType: data.contentType,
      headers: {},
      metadata: { mock: true },
    };
  }

  async extract(content: string, url: string) {
    const base = new BaseSourceAdapter();
    return base.extract(content, url);
  }
}

export class SourceRegistry {
  private adapters: Map<string, SourceAdapter> = new Map();

  constructor() {
    this.register(new BaseSourceAdapter());
    this.register(new MockSourceAdapter());
  }

  register(adapter: SourceAdapter) {
    this.adapters.set(adapter.name, adapter);
  }

  getAdapterForUrl(url: string): SourceAdapter | null {
    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(url)) return adapter;
    }
    return null;
  }

  list(): SourceAdapter[] {
    return [...this.adapters.values()];
  }

  get(name: string): SourceAdapter | null {
    return this.adapters.get(name) ?? null;
  }
}

export const globalSourceRegistry = new SourceRegistry();
