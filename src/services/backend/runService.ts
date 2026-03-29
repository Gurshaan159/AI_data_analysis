import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { invokeTauri } from "@/services/backend/tauriClient";
import type { BackendRunProgressEvent, BackendRunStartResponse, NormalizedRunRequest } from "@/shared/types";

const RUN_PROGRESS_EVENT = "run-progress";

export async function startBackendRun(runRequest: NormalizedRunRequest): Promise<BackendRunStartResponse> {
  return invokeTauri<BackendRunStartResponse>("start_run", { request: runRequest });
}

export async function cancelBackendRun(runId: string): Promise<boolean> {
  return invokeTauri<boolean>("cancel_run", { request: { runId } });
}

export async function subscribeToRunProgress(
  onEvent: (event: BackendRunProgressEvent) => void,
): Promise<UnlistenFn> {
  return listen<BackendRunProgressEvent>(RUN_PROGRESS_EVENT, (event) => {
    onEvent(event.payload);
  });
}
