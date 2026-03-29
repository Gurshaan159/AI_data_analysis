import { invokeTauri } from "@/services/backend/tauriClient";
import type { BackendHealthInfo } from "@/shared/types";

export async function getBackendHealth(): Promise<BackendHealthInfo> {
  return invokeTauri<BackendHealthInfo>("get_backend_health");
}
