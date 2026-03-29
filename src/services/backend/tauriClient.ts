import { invoke } from "@tauri-apps/api/core";
import { logger } from "@/services/logging/logger";

export async function invokeTauri<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, payload);
  } catch (error) {
    logger.error(`Tauri command failed: ${command}`, { error, payload });
    throw error;
  }
}
