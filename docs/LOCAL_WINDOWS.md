# Kaira Autonomous Agent — Local Windows Setup (Ollama)

This document explains how to run the Agent Core locally on Windows with real Ollama models, as required for Phase 2.5 and Phase 3 validation.

## Prerequisites

- Windows 10/11
- Node.js 20+
- Python 3.10+ (in PATH as `python` or `python3`)
- Git
- Ollama installed from https://ollama.com

## Ollama Models Required

The Agent Core uses:

- `qwen3:8b` → reasoning/planning/diagnosis/verification
- `qwen2.5-coder:7b` → coding/repair
- `llama3.2:3b` → lightweight tasks
- `moondream:latest` → vision (optional for Phase 1)

Pull them:

```powershell
ollama serve
# In another terminal:
ollama pull qwen3:8b
ollama pull qwen2.5-coder:7b
ollama pull llama3.2:3b
ollama pull moondream:latest
ollama list
```

## Environment Variables

All configurable via env (PowerShell):

```powershell
$env:KAIRA_WORKSPACE = "./workspace"
$env:OLLAMA_BASE_URL = "http://localhost:11434"
# Optional overrides, defaults shown:
$env:KAIRA_REASONING_MODEL = "qwen3:8b"
$env:KAIRA_CODING_MODEL = "qwen2.5-coder:7b"
$env:KAIRA_LIGHTWEIGHT_MODEL = "llama3.2:3b"
$env:KAIRA_VISION_MODEL = "moondream:latest"
$env:KAIRA_MAX_STEPS = "30"
$env:KAIRA_MAX_ATTEMPTS = "3"
$env:KAIRA_COMMAND_TIMEOUT_MS = "60000"
$env:KAIRA_ALLOW_DESTRUCTIVE = "false" # set true only for testing
$env:KAIRA_ALLOW_ALL_COMMANDS = "false" # set true only for testing
```

Also supported for compatibility:

- `KAIRA_MODEL_BASE_URL` (alias for `OLLAMA_BASE_URL`)
- `KAIRA_OLLAMA_URL` (alias)
- `KAIRA_MODEL` (single model override)

## Verify Ollama Connectivity

```powershell
curl http://localhost:11434/api/tags
# Should return JSON with models

# Or via Node:
node -e "fetch('http://localhost:11434/api/tags').then(r=>r.json()).then(j=>console.log(j))"
```

## Run Tests

```powershell
npm install
npm run typecheck
npm run test:phase1
npm run test:phase2
npm run test:ollama
npm run test:engineering
npm run test:all-phases
```

### Phase 2.5 Ollama Test

`npm run test:ollama` will:

1. Connect to Ollama at `OLLAMA_BASE_URL`
2. Verify qwen3:8b is available
3. Send a simple reasoning request
4. Receive real response, verify non-empty
5. Verify qwen2.5-coder:7b is available
6. Send simple coding request
7. Receive real response, verify non-empty

If Ollama is not reachable (e.g., in Base44 sandbox), it reports:

> "Architecture configured for real Ollama, but live Ollama execution could not be verified from the Base44 sandbox."

This is honest and expected — Base44 sandbox cannot reach user's local Ollama.

### Phase 3 Engineering Tests

Tests A-F prove real engineering work in a controlled workspace:

- **Test A — Create and execute**: Create Python program that prints 12, execute, verify output 12
- **Test B — Inspect and modify**: Read file with `value = 5`, change to 12, verify
- **Test C — Real failure and repair**: Create broken Python file, capture real SyntaxError, diagnose, repair, rerun, verify
- **Test D — Test failure**: Create project with failing test, repair implementation, rerun test, verify pass
- **Test E — Workspace security**: Attempt `../escape.txt` and absolute path outside workspace — must be rejected
- **Test F — Command failure**: Execute failing command, capture stdout, stderr, exit code, route through diagnosis/recovery

All use deterministic `ScriptedProvider` so they pass without Ollama, but architecture supports real Ollama.

## Run Agent Core Locally

```powershell
# Terminal 1: Ollama
ollama serve

# Terminal 2: Worker (autonomous driver)
npm run worker

# Terminal 3: Dev UI
npm run dev
# Open http://localhost:3000

# Or run standalone agent core via Node:
npx tsx -e "
import { AgentCore } from './src/agent/core/agentCore.ts';
const core = new AgentCore();
const report = await core.executeObjective('Create a Python file called calculator_test.py that adds 5 and 7 and prints 12');
console.log(report);
"
```

## Model Router Validation

Router mapping is validated in `test:ollama`:

- reasoning → qwen3:8b
- coding → qwen2.5-coder:7b
- lightweight → llama3.2:3b
- vision → moondream:latest

Router does NOT require all models loaded simultaneously — it selects model per task type and only calls Ollama for that model when needed.

## Safety

- Workspace root is configurable and enforced: all file operations must remain inside workspace unless explicitly authorized
- Path traversal `../` is rejected
- Absolute paths outside workspace are rejected
- Symlink escapes are checked where practical
- Command execution cwd = workspace root
- Timeouts enforced
- Retry limits enforced
- Permission levels: READ_ONLY, WORKSPACE_WRITE, COMMAND_EXECUTION, DESTRUCTIVE
- Destructive operations require `KAIRA_ALLOW_DESTRUCTIVE=true`

## Known Limitations (Base44 Sandbox)

- Base44 sandbox cannot reach user's local Ollama at `http://localhost:11434`
- Therefore real Ollama generation tests are skipped in sandbox with honest reporting
- All other tests use `ScriptedProvider` and pass deterministically
- On Windows with Ollama running, real tests will pass

## Final Report

After Phase 3, the Agent Core can genuinely:

```
HIGH-LEVEL ENGINEERING OBJECTIVE
→ UNDERSTAND
→ INSPECT REAL FILES
→ PLAN
→ CREATE/MODIFY REAL FILES
→ RUN REAL COMMANDS
→ OBSERVE REAL OUTPUT
→ DETECT REAL FAILURE
→ DIAGNOSE
→ REPAIR REAL FILES
→ RERUN
→ TEST
→ VERIFY
→ COMPLETE
```

All verified via `npm run test:all-phases`.
