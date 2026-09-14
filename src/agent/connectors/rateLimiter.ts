/**
 * Phase 9 — Rate Limiting / Circuit Breaking
 * Timeouts, retries with backoff, rate limiting, circuit breaking, response-size limits, download limits, domain policy, avoid request storms
 */

export interface RateLimitState {
  connectorName: string;
  requestsInWindow: number;
  windowStart: number;
  lastRequestAt: number;
  failures: number;
  consecutiveFailures: number;
  circuitBreaker: "CLOSED" | "OPEN" | "HALF_OPEN";
  circuitOpenUntil?: number;
  totalRequests: number;
  totalFailures: number;
}

export class RateLimiter {
  private states: Map<string, RateLimitState> = new Map();
  private configs: Map<string, { requestsPerMinute: number; burstLimit: number; failureThreshold: number; circuitOpenMs: number }> = new Map();
  private globalRequestsPerMinute: number = 100;

  constructor() {
    // Default configs
    this.configs.set("default", { requestsPerMinute: 30, burstLimit: 5, failureThreshold: 5, circuitOpenMs: 60_000 });
    this.configs.set("web_fetch", { requestsPerMinute: 30, burstLimit: 5, failureThreshold: 5, circuitOpenMs: 60_000 });
    this.configs.set("github_read", { requestsPerMinute: 30, burstLimit: 10, failureThreshold: 3, circuitOpenMs: 30_000 });
    this.configs.set("github_write", { requestsPerMinute: 10, burstLimit: 3, failureThreshold: 3, circuitOpenMs: 60_000 });
  }

  setConfig(connectorName: string, config: { requestsPerMinute: number; burstLimit: number; failureThreshold?: number; circuitOpenMs?: number }) {
    this.configs.set(connectorName, {
      failureThreshold: 5,
      circuitOpenMs: 60_000,
      ...config,
    });
  }

  private getState(connectorName: string): RateLimitState {
    if (!this.states.has(connectorName)) {
      this.states.set(connectorName, {
        connectorName,
        requestsInWindow: 0,
        windowStart: Date.now(),
        lastRequestAt: 0,
        failures: 0,
        consecutiveFailures: 0,
        circuitBreaker: "CLOSED",
        totalRequests: 0,
        totalFailures: 0,
      });
    }
    return this.states.get(connectorName)!;
  }

  private getConfig(connectorName: string) {
    return this.configs.get(connectorName) ?? this.configs.get("default")!;
  }

  canMakeRequest(connectorName: string): { allowed: boolean; reason?: string } {
    const state = this.getState(connectorName);
    const config = this.getConfig(connectorName);
    const now = Date.now();

    // Circuit breaker check
    if (state.circuitBreaker === "OPEN") {
      if (state.circuitOpenUntil && now < state.circuitOpenUntil) {
        return { allowed: false, reason: `Circuit breaker OPEN until ${new Date(state.circuitOpenUntil).toISOString()}` };
      } else {
        // Transition to HALF_OPEN
        state.circuitBreaker = "HALF_OPEN";
      }
    }

    // Window check — reset if minute passed
    if (now - state.windowStart > 60_000) {
      state.requestsInWindow = 0;
      state.windowStart = now;
    }

    if (state.requestsInWindow >= config.requestsPerMinute) {
      return { allowed: false, reason: `Rate limit exceeded: ${state.requestsInWindow}/${config.requestsPerMinute} per minute` };
    }

    // Burst check — no more than burstLimit in 1 second
    if (now - state.lastRequestAt < 1000) {
      // Count requests in last second — simplified: if last request < 200ms ago and burst exceeded
      // For simplicity, we track requestsInWindow as burst too
      if (state.requestsInWindow >= config.burstLimit && now - state.windowStart < 1000) {
        return { allowed: false, reason: `Burst limit exceeded: ${config.burstLimit} per second` };
      }
    }

    return { allowed: true };
  }

  recordRequest(connectorName: string): { allowed: boolean; reason?: string } {
    const check = this.canMakeRequest(connectorName);
    if (!check.allowed) return check;

    const state = this.getState(connectorName);
    state.requestsInWindow++;
    state.lastRequestAt = Date.now();
    state.totalRequests++;
    return { allowed: true };
  }

  recordSuccess(connectorName: string) {
    const state = this.getState(connectorName);
    state.consecutiveFailures = 0;
    if (state.circuitBreaker === "HALF_OPEN") {
      state.circuitBreaker = "CLOSED";
      delete state.circuitOpenUntil;
    }
  }

  recordFailure(connectorName: string) {
    const state = this.getState(connectorName);
    const config = this.getConfig(connectorName);
    state.failures++;
    state.consecutiveFailures++;
    state.totalFailures++;

    if (state.consecutiveFailures >= config.failureThreshold) {
      state.circuitBreaker = "OPEN";
      state.circuitOpenUntil = Date.now() + config.circuitOpenMs;
    }
  }

  // Backoff calculation
  getBackoffMs(attempt: number, baseMs: number = 1000): number {
    return baseMs * Math.pow(2, attempt) + Math.random() * 1000; // exponential + jitter
  }

  getStateSnapshot(connectorName: string): RateLimitState | null {
    return this.states.get(connectorName) ?? null;
  }

  listStates(): RateLimitState[] {
    return [...this.states.values()];
  }

  getCircuitBreakersOpen(): string[] {
    return [...this.states.values()].filter(s => s.circuitBreaker === "OPEN").map(s => s.connectorName);
  }

  clear() {
    this.states.clear();
  }
}

export const globalRateLimiter = new RateLimiter();
