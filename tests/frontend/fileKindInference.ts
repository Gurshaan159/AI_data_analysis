import { inferFileKindFromPath } from "@/domain/files/fileKinds";

interface Case {
  path: string;
  expected: ReturnType<typeof inferFileKindFromPath>;
}

const cases: Case[] = [
  { path: "/home/gurshaanthukral/Downloads/raw_counts.csv", expected: "matrix" },
  { path: "/home/gurshaanthukral/Downloads/metadata.tsv", expected: "metadata" },
  { path: "counts.csv", expected: "matrix" },
  { path: "counts.tsv", expected: "matrix" },
  { path: "/data/gene_counts.tsv", expected: "matrix" },
  { path: "samples.csv", expected: "metadata" },
  { path: "accounts.csv", expected: "metadata" },
  { path: "discounts.csv", expected: "metadata" },
  { path: "recounts.csv", expected: "metadata" },
  { path: "expression_matrix.csv", expected: "matrix" },
  { path: "matrix.mtx", expected: "matrix" },
];

function main(): void {
  let failed = 0;
  for (const { path, expected } of cases) {
    const got = inferFileKindFromPath(path);
    const pass = got === expected;
    if (!pass) {
      failed += 1;
    }
    // eslint-disable-next-line no-console
    console.log(`${pass ? "PASS" : "FAIL"} | ${path} -> ${got} (expected ${expected})`);
  }
  if (failed > 0) {
    throw new Error(`${failed} file-kind inference case(s) failed`);
  }
}

main();
