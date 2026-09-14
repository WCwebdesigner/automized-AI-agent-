/**
 * Engineering Tool Layer — Phase 3 + Phase 9
 * Registers all required tools with safety, Windows compatibility
 */

import { globalToolRegistry } from "./registry";
import { listDirectoryTool } from "./definitions/list_directory";
import { readFileTool } from "./definitions/read_file";
import { writeFileTool } from "./definitions/write_file";
import { createDirectoryTool } from "./definitions/create_directory";
import { fileExistsTool } from "./definitions/file_exists";
import { deleteFileTool } from "./definitions/delete_file";
import { moveFileTool } from "./definitions/move_file";
import { runPythonTool } from "./definitions/run_python";
import { runCommandTool } from "./definitions/run_command";
import { getWorkingDirectoryTool } from "./definitions/get_working_directory";
import { inspectDirectoryTool } from "./definitions/inspect_directory";
import { modifyFileTool } from "./definitions/modify_file";
import { verifyFileTool } from "./definitions/verify_file";
import { runTestTool, runLinterTool, runTypecheckTool } from "./definitions/run_tests";
import { webFetchTool, webSearchMockTool } from "../research/webAccess";

let registered = false;

function registerMemoryTools() {
  try {
    // dynamic import to avoid circular deps — memory tools self-register on import
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("./memoryPhase7");
  } catch {
    // ESM fallback — import will self-register
    import("./memoryPhase7.js").catch(() => {});
  }
}

export function registerEngineeringTools() {
  if (registered) return globalToolRegistry;
  
  // Core 10 required tools
  globalToolRegistry.register(listDirectoryTool);
  globalToolRegistry.register(readFileTool);
  globalToolRegistry.register(writeFileTool);
  globalToolRegistry.register(createDirectoryTool);
  globalToolRegistry.register(fileExistsTool);
  globalToolRegistry.register(deleteFileTool);
  globalToolRegistry.register(moveFileTool);
  globalToolRegistry.register(runPythonTool);
  globalToolRegistry.register(runCommandTool);
  globalToolRegistry.register(getWorkingDirectoryTool);

  // Phase 3 engineering extensions
  globalToolRegistry.register(inspectDirectoryTool);
  globalToolRegistry.register(modifyFileTool);
  globalToolRegistry.register(verifyFileTool);
  globalToolRegistry.register(runTestTool);
  globalToolRegistry.register(runLinterTool);
  globalToolRegistry.register(runTypecheckTool);

  // Phase 9 web/research tools
  globalToolRegistry.register(webFetchTool);
  globalToolRegistry.register(webSearchMockTool);

  // Phase 7 memory tools
  registerMemoryTools();

  registered = true;
  return globalToolRegistry;
}

export function getEngineeringRegistry() {
  if (!registered) registerEngineeringTools();
  return globalToolRegistry;
}

// Auto-register on import
registerEngineeringTools();

export {
  listDirectoryTool,
  readFileTool,
  writeFileTool,
  createDirectoryTool,
  fileExistsTool,
  deleteFileTool,
  moveFileTool,
  runPythonTool,
  runCommandTool,
  getWorkingDirectoryTool,
  inspectDirectoryTool,
  modifyFileTool,
  verifyFileTool,
  runTestTool,
  runLinterTool,
  runTypecheckTool,
  webFetchTool,
  webSearchMockTool,
};
