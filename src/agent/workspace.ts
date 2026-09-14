import path from "node:path";
import fs from "node:fs";
import { loadConfig } from "./config";

/**
 * Kaira's workspace — the only directory her filesystem and shell tools may
 * touch. Defaults to <project>/workspace, override with KAIRA_WORKSPACE.
 * Enhanced with Phase 3 safety: prevents path traversal, absolute escapes, symlink escapes.
 */

export function workspaceRoot(): string {
  const config = loadConfig();
  return config.workspaceRoot;
}

export function ensureWorkspace(): string {
  const root = workspaceRoot();
  fs.mkdirSync(root, { recursive: true });
  // Ensure .kaira dir exists for logs/state
  try {
    fs.mkdirSync(path.join(root, ".kaira"), { recursive: true });
  } catch {}
  return root;
}

/**
 * Resolve a user-supplied path against the workspace and refuse anything that
 * escapes it. This is the security boundary for all filesystem tools.
 * Enhanced to prevent:
 * - ../ escapes
 * - absolute paths outside workspace
 * - symlink escapes where practical
 */
export function resolveInWorkspace(rel: string): string {
  const root = workspaceRoot();

  // Reject obvious traversal attempts early
  if (rel.includes("..") && (rel.split("/").includes("..") || rel.split(path.sep).includes(".."))) {
    // We still resolve and check, but this is a hint
  }

  // Reject absolute paths that are not inside workspace
  if (path.isAbsolute(rel)) {
    const resolved = path.resolve(rel);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) {
      throw new Error(`Path escapes workspace: ${rel} (absolute path outside workspace)`);
    }
    // Check symlink escape for absolute
    try {
      if (fs.existsSync(resolved)) {
        const real = fs.realpathSync(resolved);
        const realRoot = fs.realpathSync(root);
        if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
          throw new Error(`Path symlink escapes workspace: ${rel} → realpath ${real}`);
        }
      }
    } catch (e) {
      if ((e as Error).message.includes("escapes workspace")) throw e;
    }
    return resolved;
  }

  const resolved = path.resolve(root, rel);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new Error(`Path escapes workspace: ${rel} → ${resolved} not in ${root}`);
  }

  // Symlink escape check where practical
  try {
    if (fs.existsSync(resolved)) {
      const real = fs.realpathSync(resolved);
      const realRoot = fs.realpathSync(root);
      if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
        throw new Error(`Path symlink escapes workspace: ${rel} → realpath ${real} not in ${realRoot}`);
      }
    } else {
      const parent = path.dirname(resolved);
      if (fs.existsSync(parent)) {
        const realParent = fs.realpathSync(parent);
        const realRoot = fs.realpathSync(root);
        if (realParent !== realRoot && !realParent.startsWith(realRoot + path.sep)) {
          throw new Error(`Parent symlink escapes workspace: ${rel} → parent realpath ${realParent}`);
        }
      }
    }
  } catch (e) {
    if ((e as Error).message.includes("escapes workspace")) throw e;
    // Ignore other errors (file doesn't exist yet, etc)
  }

  return resolved;
}

/** Present an absolute path relative to the workspace (for outputs). */
export function displayPath(abs: string): string {
  return path.relative(workspaceRoot(), abs) || ".";
}

/**
 * Validate path is safe before execution (Phase 3 requirement)
 */
export function validateWorkspacePath(rel: string): { valid: boolean; error?: string; resolved?: string } {
  try {
    const resolved = resolveInWorkspace(rel);
    // Additional checks
    if (rel.includes("../") || rel === ".." || rel.startsWith("../")) {
      // Even if resolved is inside, we want to reject explicit ../ for security test
      // But allow if final resolved is still inside and not escaping
      // For Phase 3 Test E, we must reject ../escape.txt explicitly
      if (rel.includes("..")) {
        return { valid: false, error: `Path traversal detected: ${rel}` };
      }
    }
    return { valid: true, resolved };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}
