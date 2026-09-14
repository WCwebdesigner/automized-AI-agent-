import type {
  ChatMessage,
  GenerateOptions,
  GenerateResult,
  ModelProvider,
  ProviderStatus,
} from "./types";

/**
 * Ollama provider — the default local-first backend.
 * Talks to a local Ollama server (default http://localhost:11434) running
 * models like qwen3:8b, qwen2.5-coder:7b, llama3.2:3b, moondream:latest.
 * Handles connection errors, model-not-found, timeout, structured errors.
 * Supports env configuration via OLLAMA_BASE_URL / KAIRA_MODEL_BASE_URL.
 */

export class OllamaProvider implements ModelProvider {
  readonly id = "ollama" as const;
  readonly label = "Ollama (local)";

  constructor(
    private baseUrl: string,
    private model: string,
  ) {
    // Normalize base URL from env if needed
    const envUrl = process.env.OLLAMA_BASE_URL ?? process.env.KAIRA_MODEL_BASE_URL ?? process.env.KAIRA_OLLAMA_URL;
    if (envUrl && !baseUrl) {
      this.baseUrl = envUrl;
    }
    this.baseUrl = this.baseUrl.replace(/\/$/, "");
  }

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async status(): Promise<ProviderStatus> {
    try {
      const res = await fetch(this.url("/api/tags"), {
        signal: AbortSignal.timeout(4000),
      });
      if (!res.ok) {
        return {
          ok: false,
          detail: `Ollama responded with HTTP ${res.status} at ${this.baseUrl}`,
          models: [],
        };
      }
      const data = (await res.json()) as {
        models?: Array<{ name?: string; model?: string }>;
      };
      const models = (data.models ?? [])
        .map((m) => m.name ?? m.model ?? "")
        .filter(Boolean);
      return models.length
        ? { ok: true, detail: `${models.length} model(s) available at ${this.baseUrl}`, models }
        : {
            ok: false,
            detail:
              `Ollama is running at ${this.baseUrl} but no models are installed. Run: ollama pull qwen3:8b, ollama pull qwen2.5-coder:7b, ollama pull llama3.2:3b`,
            models,
          };
    } catch (err) {
      return {
        ok: false,
        detail: `Cannot reach Ollama at ${this.baseUrl} — is it running? (${errMessage(err)}). Set OLLAMA_BASE_URL env to configure endpoint.`,
        models: [],
      };
    }
  }

  async generate(
    messages: ChatMessage[],
    opts: GenerateOptions = {},
  ): Promise<GenerateResult> {
    const model = opts.model || this.model;
    if (!model) {
      throw new Error(
        `No model configured for Ollama. Set one in Settings or KAIRA_MODEL env. Tried baseUrl: ${this.baseUrl}`,
      );
    }
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(this.url("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: opts.temperature ?? 0.2,
            num_predict: opts.maxTokens ?? 2048,
          },
        }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 180_000),
      });
    } catch (err) {
      const msg = errMessage(err);
      if (msg.includes("Timeout") || msg.includes("timed out") || msg.includes("aborted")) {
        throw new Error(`Ollama timeout after ${opts.timeoutMs ?? 180_000}ms for model ${model} at ${this.baseUrl}: ${msg}`);
      }
      if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed") || msg.includes("Cannot reach")) {
        throw new Error(`Ollama connection failed at ${this.baseUrl}: ${msg}. Is Ollama running? Try: ollama serve`);
      }
      throw new Error(`Ollama connection error at ${this.baseUrl}: ${msg}`);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const lowerBody = body.toLowerCase();
      if (res.status === 404 || lowerBody.includes("model not found") || lowerBody.includes("not found")) {
        throw new Error(`Model "${model}" not found at ${this.baseUrl}. Pull it with: ollama pull ${model}. Details: ${body.slice(0, 300)}`);
      }
      throw new Error(
        `Ollama generate failed (HTTP ${res.status}) for model ${model} at ${this.baseUrl}: ${body.slice(0, 500)}`,
      );
    }

    let data: {
      message?: { content?: string };
      prompt_eval_count?: number;
      eval_count?: number;
      error?: string;
    };

    try {
      data = (await res.json()) as typeof data;
    } catch (err) {
      throw new Error(`Ollama returned invalid JSON for model ${model}: ${(err as Error).message}`);
    }

    if (data.error) {
      const lower = data.error.toLowerCase();
      if (lower.includes("not found") || lower.includes("model")) {
        throw new Error(`Model "${model}" not found: ${data.error}. Pull with: ollama pull ${model}`);
      }
      throw new Error(`Ollama error for model ${model}: ${data.error}`);
    }

    const content = data.message?.content ?? "";
    if (!content) {
      throw new Error(`Ollama returned empty response for model ${model}`);
    }

    return {
      content,
      model,
      tokensIn: data.prompt_eval_count ?? null,
      tokensOut: data.eval_count ?? null,
      latencyMs: Date.now() - started,
    };
  }
}

export function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
