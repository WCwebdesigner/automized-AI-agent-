/**
 * Phase 7 — Secret Detection — NEVER store secrets in memory
 * Blocks API keys, passwords, tokens, private keys, session cookies, credentials
 */

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp; severity: "BLOCK" | "REDACT" }> = [
  // Private keys
  { name: "PRIVATE_KEY_PEM", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, severity: "BLOCK" },
  { name: "PRIVATE_KEY_CONTENT", regex: /PRIVATE\s*KEY/i, severity: "BLOCK" },
  // AWS
  { name: "AWS_ACCESS_KEY", regex: /AKIA[0-9A-Z]{16}/, severity: "BLOCK" },
  { name: "AWS_SECRET", regex: /aws_secret_access_key\s*=\s*['\"]?[A-Za-z0-9/+=]{40}/i, severity: "BLOCK" },
  // Generic API keys - common patterns
  { name: "API_KEY_ASSIGNMENT", regex: /(api[_-]?key|apikey)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{20,}['\"]?/i, severity: "BLOCK" },
  { name: "GENERIC_API_KEY", regex: /sk-(?:proj-|live-)?[A-Za-z0-9]{20,}/, severity: "BLOCK" },
  { name: "GITHUB_TOKEN", regex: /gh[oprs]_[A-Za-z0-9_]{36,}/, severity: "BLOCK" },
  { name: "STRIPE_KEY", regex: /(sk|rk)_(live|test)_[A-Za-z0-9]{20,}/, severity: "BLOCK" },
  // Passwords
  { name: "PASSWORD_ASSIGNMENT", regex: /(password|passwd|pwd)\s*[:=]\s*['\"]?[^'"\s]{8,}/i, severity: "BLOCK" },
  { name: "PASSWORD_URL", regex: /:\/\/[^:\s]+:[^@\s]+@/, severity: "BLOCK" }, // user:pass@
  // Tokens
  { name: "BEARER_TOKEN", regex: /Bearer\s+[A-Za-z0-9\-_\.~\+\/]+=*$/im, severity: "BLOCK" },
  { name: "JWT_TOKEN", regex: /eyJ[A-Za-z0-9_\-]+\.eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-_]+/, severity: "BLOCK" },
  { name: "TOKEN_ASSIGNMENT", regex: /(auth[_-]?token|access[_-]?token|secret[_-]?token)\s*[:=]\s*['\"]?[A-Za-z0-9\-_\.]{20,}/i, severity: "BLOCK" },
  // Session cookies
  { name: "SESSION_COOKIE", regex: /(session[_-]?id|connect\.sid|session[_-]?token)\s*[:=]\s*['\"]?[A-Za-z0-9\-_\.]{20,}/i, severity: "BLOCK" },
  { name: "COOKIE_HEADER", regex: /Cookie:\s*[^\n]*session/i, severity: "BLOCK" },
  // Env files with secrets
  { name: "ENV_SECRET", regex: /(DATABASE_URL|SECRET_KEY|ENCRYPTION_KEY)\s*=\s*.+/i, severity: "BLOCK" },
  // Generic long hex/base64 that looks like secret (conservative)
  { name: "LONG_SECRET_HEX", regex: /(?:secret|credential|token)[^A-Za-z0-9]*[A-Fa-f0-9]{32,}/i, severity: "BLOCK" },
];

const REDACT_PATTERNS: Array<{ regex: RegExp; replacement: string }> = [
  { regex: /sk-[A-Za-z0-9\-_]{20,}/g, replacement: "[REDACTED_API_KEY]" },
  { regex: /AKIA[0-9A-Z]{16}/g, replacement: "[REDACTED_AWS_KEY]" },
  { regex: /(password\s*[:=]\s*)['\"]?[^'"\s\n]{4,}['\"]?/gi, replacement: "$1[REDACTED]" },
];

export interface SecretDetectionResult {
  hasSecret: boolean;
  blocked: boolean;
  findings: Array<{ pattern: string; severity: "BLOCK" | "REDACT"; snippet: string }>;
  redactedContent?: string;
}

export function detectSecrets(content: string): SecretDetectionResult {
  const findings: Array<{ pattern: string; severity: "BLOCK" | "REDACT"; snippet: string }> = [];
  let blocked = false;

  for (const p of SECRET_PATTERNS) {
    const match = content.match(p.regex);
    if (match) {
      const snippet = match[0].slice(0, 80);
      findings.push({ pattern: p.name, severity: p.severity, snippet });
      if (p.severity === "BLOCK") blocked = true;
    }
  }

  // Additional heuristic: .env file contents, credentials file
  const lower = content.toLowerCase();
  if (lower.includes(".env") && (lower.includes("key=") || lower.includes("secret="))) {
    // if content looks like env file with assignments
    if (/^[A-Z_]+=.*$/m.test(content) && content.split("\n").length > 3) {
      findings.push({ pattern: "ENV_FILE", severity: "BLOCK", snippet: ".env file content" });
      blocked = true;
    }
  }

  let redactedContent = content;
  for (const r of REDACT_PATTERNS) {
    redactedContent = redactedContent.replace(r.regex, r.replacement);
  }

  return {
    hasSecret: findings.length > 0,
    blocked,
    findings,
    redactedContent: blocked ? undefined : redactedContent !== content ? redactedContent : undefined,
  };
}

export function isContentSafeForMemory(content: string): { safe: boolean; reason?: string } {
  const result = detectSecrets(content);
  if (result.blocked) {
    const names = result.findings.map(f => f.pattern).join(", ");
    return { safe: false, reason: `Blocked secret patterns: ${names}` };
  }
  return { safe: true };
}
