import { invokeTauri } from "@/services/backend/tauriClient";

interface FileDialogResult {
  paths: string[];
}

interface FolderDialogResult {
  path: string | null;
}

export async function pickInputFilesFromBackend(): Promise<string[]> {
  const result = await invokeTauri<FileDialogResult>("pick_input_files");
  return result.paths;
}

export async function pickOutputFolderFromBackend(): Promise<string | null> {
  const result = await invokeTauri<FolderDialogResult>("pick_output_folder");
  return result.path;
}
