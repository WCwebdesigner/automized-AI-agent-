/**
 * All Phases Test Runner
 * Runs Phase 1, 2, 2.5, 3 tests sequentially
 */

import { spawn } from "node:child_process";

function run(script: string): Promise<{ ok: boolean; code: number | null }> {
  return new Promise((resolve) => {
    console.log(`\n\n${"=".repeat(70)}`);
    console.log(`Running: ${script}`);
    console.log("=".repeat(70) + "\n");

    const child = spawn("npx", ["tsx", script], {
      stdio: "inherit",
      env: { ...process.env, KAIRA_ALLOW_ALL_COMMANDS: "true", KAIRA_ALLOW_DESTRUCTIVE: "true" },
    });

    child.on("close", (code) => {
      resolve({ ok: code === 0, code });
    });
    child.on("error", (err) => {
      console.error(`Failed to run ${script}: ${err.message}`);
      resolve({ ok: false, code: 1 });
    });
  });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  ALL PHASES TEST — Phase 1, 2, 2.5, 3                  ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const tests = [
    "scripts/test-phase1.ts",
    "scripts/test-phase2.ts",
    "scripts/test-ollama.ts",
    "scripts/test-engineering.ts",
  ];

  const results: Array<{ script: string; ok: boolean; code: number | null }> = [];

  for (const test of tests) {
    const result = await run(test);
    results.push({ script: test, ok: result.ok, code: result.code });
  }

  console.log("\n\n" + "=".repeat(70));
  console.log("FINAL RESULTS");
  console.log("=".repeat(70));
  for (const r of results) {
    console.log(`${r.ok ? "✔ PASS" : "✘ FAIL"} — ${r.script} (exit ${r.code})`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length === 0) {
    console.log("\nALL PHASES: PASS");
  } else {
    console.log(`\nALL PHASES: FAIL — ${failed.length} test(s) failed`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main();
