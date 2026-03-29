import type { FileKind } from "@/shared/types";

/** Gene/sample count matrix filenames (e.g. raw_counts.csv). Must not match substrings like "accounts" or "discounts". */
function tabularPathLooksLikeCountMatrix(normalizedPath: string): boolean {
  return /(^|[^a-z0-9])counts([^a-z0-9]|$)/.test(normalizedPath);
}

export function inferFileKindFromPath(path: string): FileKind {
  const normalized = path.toLowerCase();
  if (normalized.endsWith(".fastq") || normalized.endsWith(".fastq.gz") || normalized.endsWith(".fq.gz")) {
    return "fastq";
  }
  if (normalized.endsWith(".mtx") || normalized.endsWith(".h5ad") || normalized.includes("matrix")) {
    return "matrix";
  }
  const isTabular = normalized.endsWith(".csv") || normalized.endsWith(".tsv");
  if (isTabular && tabularPathLooksLikeCountMatrix(normalized)) {
    return "matrix";
  }
  if (
    isTabular ||
    normalized.endsWith(".xlsx") ||
    normalized.includes("metadata") ||
    normalized.includes("sample_sheet")
  ) {
    return "metadata";
  }
  return "unknown";
}
