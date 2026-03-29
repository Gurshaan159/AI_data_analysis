import { open } from "@tauri-apps/plugin-dialog";

import { invokeTauri } from "@/services/backend/tauriClient";

interface FolderDialogResult {
  path: string | null;
}

/**
 * Multi-select file open. Uses the Tauri dialog plugin (not rfd from Rust) so GTK/Linux
 * reliably allows selecting several files in one pass (matrix + metadata, etc.).
 */
export async function pickInputFilesFromBackend(): Promise<string[]> {
  const selected = await open({
    multiple: true,
    title: "Select input files",
    filters: [
      { name: "Tabular", extensions: ["tsv", "csv", "txt"] },
      { name: "All files", extensions: ["*"] },
    ],
  });
  if (selected === null) {
    return [];
  }
  return Array.isArray(selected) ? selected : [selected];
}

export async function pickOutputFolderFromBackend(): Promise<string | null> {
  const result = await invokeTauri<FolderDialogResult>("pick_output_folder");
  return result.path;
}
