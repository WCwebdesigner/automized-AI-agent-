/**
 * Checkpointing — Phase 6
 * Project resumable after interruption, persist objective, plan, requirements, task graph, current task, completed/pending, attempts, verification, failures, repairs, changes
 */

import { randomUUID } from "node:crypto";
import { Project } from "../project/types";
import { TaskGraph } from "../taskGraph/types";
import { Requirement } from "../requirements/types";
import { Observation, Evidence } from "../observation/types";
import { VerificationResult } from "../verification/types";

export interface Checkpoint {
  id: string;
  projectId: string;
  objectiveId: string;
  project: Project;
  taskGraph: any; // serialized task graph
  requirements: Requirement[];
  observations: Observation[];
  evidence: Evidence[];
  verificationResults: VerificationResult[];
  currentTaskId?: string;
  completedTaskIds: string[];
  failedTaskIds: string[];
  pendingTaskIds: string[];
  timestamp: string;
  reason: string;
}

export function createCheckpointId(): string {
  return randomUUID();
}

export class CheckpointManager {
  private checkpoints: Map<string, Checkpoint> = new Map();

  createCheckpoint(params: {
    project: Project;
    taskGraph: TaskGraph;
    requirements: Requirement[];
    observations: Observation[];
    evidence: Evidence[];
    verificationResults: VerificationResult[];
    currentTaskId?: string;
    reason?: string;
  }): Checkpoint {
    const graphSerialized = {
      id: params.taskGraph.id,
      projectId: params.taskGraph.projectId,
      objectiveId: params.taskGraph.objectiveId,
      tasks: Array.from(params.taskGraph.tasks.values()),
      createdAt: params.taskGraph.createdAt,
      updatedAt: params.taskGraph.updatedAt,
    };

    const checkpoint: Checkpoint = {
      id: createCheckpointId(),
      projectId: params.project.id,
      objectiveId: params.project.objectiveId,
      project: { ...params.project },
      taskGraph: graphSerialized,
      requirements: [...params.requirements],
      observations: [...params.observations],
      evidence: [...params.evidence],
      verificationResults: [...params.verificationResults],
      currentTaskId: params.currentTaskId,
      completedTaskIds: [...params.project.completedTaskIds],
      failedTaskIds: [...params.project.failedTaskIds],
      pendingTaskIds: [...params.project.pendingTaskIds],
      timestamp: new Date().toISOString(),
      reason: params.reason ?? "Periodic checkpoint",
    };

    this.checkpoints.set(checkpoint.id, checkpoint);
    return checkpoint;
  }

  getCheckpoint(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  getLatestCheckpoint(projectId: string): Checkpoint | undefined {
    const all = Array.from(this.checkpoints.values())
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return all[0];
  }

  getCheckpointsByProject(projectId: string): Checkpoint[] {
    return Array.from(this.checkpoints.values())
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  canResume(projectId: string): boolean {
    return !!this.getLatestCheckpoint(projectId);
  }

  // Serialize for persistence layer
  serialize(checkpointId: string): any {
    return this.checkpoints.get(checkpointId);
  }

  deserialize(data: any): Checkpoint {
    const checkpoint = data as Checkpoint;
    this.checkpoints.set(checkpoint.id, checkpoint);
    return checkpoint;
  }

  clear(projectId?: string): void {
    if (projectId) {
      for (const [id, cp] of this.checkpoints) {
        if (cp.projectId === projectId) this.checkpoints.delete(id);
      }
    } else {
      this.checkpoints.clear();
    }
  }
}

export const globalCheckpointManager = new CheckpointManager();
