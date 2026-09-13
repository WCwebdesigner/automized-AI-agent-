/**
 * Observation Module — Phase 4
 */

export * from "./types";
export * from "./limits";
export * from "./observation";
export * from "./evidence";

import { ObservationCollector, globalObservationCollector } from "./observation";
import { EvidenceFactory } from "./evidence";
import { ObservationLimiter, globalObservationLimiter } from "./limits";

export { ObservationCollector, globalObservationCollector, EvidenceFactory, ObservationLimiter, globalObservationLimiter };

// Convenience: create observation and evidence chain
import { Observation, Evidence } from "./types";
import { StructuredToolResult } from "../tools/registry";

export async function observeToolExecution(
  objectiveId: string,
  taskId: string,
  runId: string,
  toolName: string,
  result: StructuredToolResult,
  durationMs: number,
  workspaceRoot?: string,
  actionId?: string
): Promise<{ observation: Observation; evidence: Evidence[] }> {
  const observation = await ObservationCollector.fromToolResult(
    objectiveId,
    taskId,
    runId,
    toolName,
    result,
    durationMs,
    workspaceRoot,
    actionId
  );
  const evidence = EvidenceFactory.fromObservation(observation);
  return { observation, evidence };
}
