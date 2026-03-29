import type { FileKind } from "@/shared/types";

export function inferFileKindFromPath(path: string): FileKind {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".fastq") || normalized.endsWith(".fastq.gz") || normalized.endsWith(".fq.gz")) {
    return "fastq";
  }
  if (normalized.endsWith(".mtx") || normalized.endsWith(".h5ad") || normalized.includes("matrix")) {
    return "matrix";
  }
  if (
    normalized.endsWith(".csv") ||
    normalized.endsWith(".tsv") ||
    normalized.endsWith(".xlsx") ||
    normalized.includes("metadata") ||
    normalized.includes("sample_sheet")
  ) {
    return "metadata";
  }
  return "unknown";
}
