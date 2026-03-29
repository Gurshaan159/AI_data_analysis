import { pickInputFilesFromBackend, pickOutputFolderFromBackend } from "@/services/backend/fileDialogService";
import { toBackendErrorMessage } from "@/services/backend/backendError";
import { logger } from "@/services/logging/logger";

export async function pickInputFiles(): Promise<string[]> {
  try {
    const files = await pickInputFilesFromBackend();
    if (files.length) {
      logger.info("Selected input files", { count: files.length });
    }
    return files;
  } catch (error) {
    logger.warn("Failed to pick input files from backend.", { error });
    throw new Error(toBackendErrorMessage(error, "Unable to open the input file picker."));
  }
}

export async function pickOutputFolder(): Promise<string | null> {
  try {
    const selectedFolder = await pickOutputFolderFromBackend();
    logger.info("Selected output folder", { selectedFolder });
    return selectedFolder;
  } catch (error) {
    logger.warn("Failed to pick output folder from backend.", { error });
    throw new Error(toBackendErrorMessage(error, "Unable to open the output folder picker."));
  }
}
