import { invokeTauri } from "@/services/backend/tauriClient";
import type { PathValidationResult } from "@/shared/types";

export async function validateOutputPath(path: string): Promise<PathValidationResult> {
  return invokeTauri<PathValidationResult>("validate_path_for_analysis", { path });
}
