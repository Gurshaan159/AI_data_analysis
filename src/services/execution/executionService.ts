import { cancelBackendRun, startBackendRun, subscribeToRunProgress } from "@/services/backend/runService";
import { logger } from "@/services/logging/logger";
import type { BackendRunProgressEvent, BackendRunStartResponse, NormalizedRunRequest } from "@/shared/types";

export async function submitWorkflowExecution(request: NormalizedRunRequest): Promise<BackendRunStartResponse> {
  logger.info("Submitting workflow execution request", { pipelineId: request.selectedPipelineId });
  return startBackendRun(request);
}

export async function subscribeRunProgress(
  onEvent: (event: BackendRunProgressEvent) => void,
): Promise<() => void> {
  return subscribeToRunProgress(onEvent);
}

export async function requestRunCancellation(runId: string): Promise<boolean> {
  return cancelBackendRun(runId);
}
