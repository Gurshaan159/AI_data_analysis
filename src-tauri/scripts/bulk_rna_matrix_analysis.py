#!/usr/bin/env python3
import argparse
import csv
import json
import math
import os
import sys
from typing import Dict, List, Tuple


def fail(code: str, message: str, details: Dict[str, str] = None) -> None:
    payload = {"status": "error", "code": code, "message": message, "details": details or {}}
    print(json.dumps(payload), file=sys.stderr)
    sys.exit(1)


def detect_delimiter(path: str) -> str:
    lower = path.lower()
    if lower.endswith(".tsv") or lower.endswith(".txt"):
        return "\t"
    if lower.endswith(".csv"):
        return ","
    try:
        with open(path, "r", encoding="utf-8", newline="") as handle:
            first = handle.readline()
            if "\t" in first:
                return "\t"
    except OSError:
        pass
    return ","


def read_matrix(path: str) -> Tuple[List[str], List[str], List[List[float]]]:
    delimiter = detect_delimiter(path)
    if not os.path.exists(path):
        fail("matrix-not-found", "Matrix input file does not exist.", {"path": path})

    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.reader(handle, delimiter=delimiter)
        rows = list(reader)

    if len(rows) < 2:
        fail("matrix-empty", "Matrix file must contain a header and at least one data row.")

    header = rows[0]
    if len(header) < 3:
        fail("matrix-invalid-shape", "Matrix must contain gene_id and at least two sample columns.")

    sample_ids = [value.strip() for value in header[1:]]
    if any(not sample_id for sample_id in sample_ids):
        fail("matrix-sample-id-missing", "Matrix header contains empty sample IDs.")

    gene_ids: List[str] = []
    values: List[List[float]] = []
    for row_index, row in enumerate(rows[1:], start=2):
        if len(row) != len(header):
            fail(
                "matrix-row-length-mismatch",
                "Matrix row width does not match header width.",
                {"line": str(row_index)},
            )
        gene_id = row[0].strip()
        if not gene_id:
            fail("matrix-gene-id-missing", "Matrix row has empty gene_id.", {"line": str(row_index)})
        try:
            numeric = [float(item) for item in row[1:]]
        except ValueError:
            fail("matrix-non-numeric", "Matrix contains non-numeric values.", {"line": str(row_index)})
        gene_ids.append(gene_id)
        values.append(numeric)

    return gene_ids, sample_ids, values


def read_metadata(path: str) -> Tuple[List[Dict[str, str]], str, str]:
    delimiter = detect_delimiter(path)
    if not os.path.exists(path):
        fail("metadata-not-found", "Metadata input file does not exist.", {"path": path})

    with open(path, "r", encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle, delimiter=delimiter)
        rows = list(reader)
        headers = reader.fieldnames or []

    if not rows:
        fail("metadata-empty", "Metadata file must contain at least one row.")

    sample_key = "sample_id" if "sample_id" in headers else headers[0] if headers else ""
    if not sample_key:
        fail("metadata-sample-key-missing", "Metadata header must include sample_id column.")

    group_key = "condition" if "condition" in headers else "group" if "group" in headers else ""
    if not group_key:
        fail(
            "metadata-grouping-missing",
            "Metadata header must include a condition or group column for bulk RNA analysis.",
        )

    for idx, row in enumerate(rows, start=2):
        if not (row.get(sample_key) or "").strip():
            fail("metadata-sample-id-missing", "Metadata row has empty sample identifier.", {"line": str(idx)})
        if not (row.get(group_key) or "").strip():
            fail("metadata-group-value-missing", "Metadata row has empty grouping value.", {"line": str(idx)})

    return rows, sample_key, group_key


def validate_inputs(matrix_path: str, metadata_path: str) -> Dict[str, object]:
    gene_ids, sample_ids, _ = read_matrix(matrix_path)
    metadata_rows, sample_key, group_key = read_metadata(metadata_path)
    sample_to_group = {row[sample_key].strip(): row[group_key].strip() for row in metadata_rows}

    missing = [sample for sample in sample_ids if sample not in sample_to_group]
    if missing:
        fail(
            "metadata-sample-mismatch",
            "Metadata is missing samples present in matrix.",
            {"missing_samples": ",".join(missing)},
        )

    groups = sorted({group for group in sample_to_group.values() if group})
    if len(groups) < 2:
        fail(
            "metadata-grouping-invalid",
            "Bulk RNA matrix analysis requires at least two groups for differential expression.",
            {"detected_groups": ",".join(groups)},
        )

    return {
        "geneCount": len(gene_ids),
        "sampleCount": len(sample_ids),
        "metadataRows": len(metadata_rows),
        "groupColumn": group_key,
        "groupCount": len(groups),
    }


def normalize_matrix(values: List[List[float]]) -> List[List[float]]:
    if not values:
        return values
    sample_count = len(values[0])
    column_sums = [0.0] * sample_count
    for row in values:
        for idx, value in enumerate(row):
            column_sums[idx] += value

    normalized: List[List[float]] = []
    for row in values:
        scaled = []
        for idx, value in enumerate(row):
            denom = column_sums[idx] if column_sums[idx] > 0 else 1.0
            scaled.append((value / denom) * 1_000_000.0)
        normalized.append(scaled)
    return normalized


def write_matrix(path: str, gene_ids: List[str], sample_ids: List[str], values: List[List[float]]) -> None:
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["gene_id", *sample_ids])
        for gene_id, row in zip(gene_ids, values):
            writer.writerow([gene_id, *[f"{value:.6f}" for value in row]])


def transpose(values: List[List[float]]) -> List[List[float]]:
    if not values:
        return []
    return [list(column) for column in zip(*values)]


def dot(a: List[float], b: List[float]) -> float:
    return sum(x * y for x, y in zip(a, b))


def mat_vec(matrix: List[List[float]], vector: List[float]) -> List[float]:
    return [dot(row, vector) for row in matrix]


def normalize_vector(vector: List[float]) -> List[float]:
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        return [0.0 for _ in vector]
    return [value / norm for value in vector]


def power_iteration(matrix: List[List[float]], iterations: int = 60) -> List[float]:
    size = len(matrix)
    vec = [1.0 / math.sqrt(size) for _ in range(size)]
    for _ in range(iterations):
        vec = normalize_vector(mat_vec(matrix, vec))
    return vec


def outer(v: List[float], w: List[float]) -> List[List[float]]:
    return [[a * b for b in w] for a in v]


def matrix_subtract(a: List[List[float]], b: List[List[float]]) -> List[List[float]]:
    return [[x - y for x, y in zip(row_a, row_b)] for row_a, row_b in zip(a, b)]


def compute_sample_covariance(sample_vectors: List[List[float]]) -> List[List[float]]:
    sample_count = len(sample_vectors)
    feature_count = len(sample_vectors[0]) if sample_vectors else 0
    centered = [[0.0] * feature_count for _ in range(sample_count)]
    means = [0.0] * feature_count
    for feature_idx in range(feature_count):
        means[feature_idx] = sum(sample_vectors[sample_idx][feature_idx] for sample_idx in range(sample_count)) / max(sample_count, 1)
    for sample_idx in range(sample_count):
        for feature_idx in range(feature_count):
            centered[sample_idx][feature_idx] = sample_vectors[sample_idx][feature_idx] - means[feature_idx]

    cov = [[0.0] * sample_count for _ in range(sample_count)]
    denom = max(feature_count - 1, 1)
    for i in range(sample_count):
        for j in range(sample_count):
            cov[i][j] = dot(centered[i], centered[j]) / denom
    return cov


def compute_pca_coordinates(sample_vectors: List[List[float]]) -> List[Tuple[float, float]]:
    if len(sample_vectors) < 2:
        return [(0.0, 0.0) for _ in sample_vectors]
    cov = compute_sample_covariance(sample_vectors)
    pc1 = power_iteration(cov)
    lambda1 = dot(pc1, mat_vec(cov, pc1))
    cov_residual = matrix_subtract(cov, outer([lambda1 * value for value in pc1], pc1))
    pc2 = power_iteration(cov_residual)
    return list(zip(pc1, pc2))


def write_pca_plot(path: str, sample_ids: List[str], coords: List[Tuple[float, float]]) -> None:
    width = 800
    height = 500
    padding = 50
    xs = [point[0] for point in coords] or [0.0]
    ys = [point[1] for point in coords] or [0.0]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = (max_x - min_x) if max_x != min_x else 1.0
    span_y = (max_y - min_y) if max_y != min_y else 1.0

    def scale_x(value: float) -> float:
        return padding + ((value - min_x) / span_x) * (width - 2 * padding)

    def scale_y(value: float) -> float:
        return height - padding - ((value - min_y) / span_y) * (height - 2 * padding)

    points = []
    for sample_id, (x, y) in zip(sample_ids, coords):
        px = scale_x(x)
        py = scale_y(y)
        points.append(
            f'<circle cx="{px:.1f}" cy="{py:.1f}" r="5" fill="#2563eb"/>'
            f'<text x="{px + 8:.1f}" y="{py - 8:.1f}" font-size="12">{sample_id}</text>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        '<rect width="100%" height="100%" fill="white"/>'
        f'<line x1="{padding}" y1="{height - padding}" x2="{width - padding}" y2="{height - padding}" stroke="#444"/>'
        f'<line x1="{padding}" y1="{padding}" x2="{padding}" y2="{height - padding}" stroke="#444"/>'
        '<text x="60" y="30" font-size="16">Bulk RNA PCA (PC1 vs PC2)</text>'
        + "".join(points)
        + "</svg>"
    )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(svg)


def grouped_indexes(sample_ids: List[str], metadata_rows: List[Dict[str, str]], sample_key: str, group_key: str) -> Tuple[str, str, List[int], List[int]]:
    sample_to_group = {row[sample_key].strip(): row[group_key].strip() for row in metadata_rows}
    groups = sorted({group for group in sample_to_group.values() if group})
    if len(groups) < 2:
        fail(
            "metadata-grouping-invalid",
            "Bulk RNA matrix analysis requires at least two groups for differential expression.",
            {"detected_groups": ",".join(groups)},
        )
    group_a, group_b = groups[0], groups[1]
    idx_a = [idx for idx, sample in enumerate(sample_ids) if sample_to_group.get(sample) == group_a]
    idx_b = [idx for idx, sample in enumerate(sample_ids) if sample_to_group.get(sample) == group_b]
    if not idx_a or not idx_b:
        fail("metadata-grouping-invalid", "Failed to map matrix samples to at least two usable groups.")
    return group_a, group_b, idx_a, idx_b


def write_differential(path: str, gene_ids: List[str], sample_ids: List[str], normalized: List[List[float]], metadata_rows: List[Dict[str, str]], sample_key: str, group_key: str) -> List[Tuple[str, float, float]]:
    group_a, group_b, idx_a, idx_b = grouped_indexes(sample_ids, metadata_rows, sample_key, group_key)
    points: List[Tuple[str, float, float]] = []
    with open(path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, delimiter="\t")
        writer.writerow(["gene_id", f"mean_{group_a}", f"mean_{group_b}", "log2_fold_change", "pseudo_pvalue"])
        for gene_id, row in zip(gene_ids, normalized):
            mean_a = sum(row[i] for i in idx_a) / len(idx_a)
            mean_b = sum(row[i] for i in idx_b) / len(idx_b)
            log2_fc = math.log2((mean_b + 1.0) / (mean_a + 1.0))
            pseudo_p = min(1.0, 1.0 / (1.0 + abs(log2_fc) * 25.0))
            writer.writerow([gene_id, f"{mean_a:.6f}", f"{mean_b:.6f}", f"{log2_fc:.6f}", f"{pseudo_p:.6f}"])
            points.append((gene_id, log2_fc, -math.log10(max(pseudo_p, 1e-12))))
    return points


def write_volcano(path: str, points: List[Tuple[str, float, float]]) -> None:
    width = 800
    height = 500
    padding = 50
    xs = [point[1] for point in points] or [0.0]
    ys = [point[2] for point in points] or [0.0]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)
    span_x = (max_x - min_x) if max_x != min_x else 1.0
    span_y = (max_y - min_y) if max_y != min_y else 1.0

    def scale_x(value: float) -> float:
        return padding + ((value - min_x) / span_x) * (width - 2 * padding)

    def scale_y(value: float) -> float:
        return height - padding - ((value - min_y) / span_y) * (height - 2 * padding)

    circles = []
    for _, log2_fc, neg_log10_p in points:
        circles.append(
            f'<circle cx="{scale_x(log2_fc):.1f}" cy="{scale_y(neg_log10_p):.1f}" r="3" fill="#dc2626" opacity="0.75"/>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}">'
        '<rect width="100%" height="100%" fill="white"/>'
        f'<line x1="{padding}" y1="{height - padding}" x2="{width - padding}" y2="{height - padding}" stroke="#444"/>'
        f'<line x1="{padding}" y1="{padding}" x2="{padding}" y2="{height - padding}" stroke="#444"/>'
        '<text x="60" y="30" font-size="16">Bulk RNA Volcano Plot</text>'
        + "".join(circles)
        + "</svg>"
    )
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(svg)


def write_summary(path: str, gene_count: int, sample_count: int, metadata_rows: int, group_key: str) -> None:
    lines = [
        "Bulk RNA matrix-based downstream analysis summary",
        f"Genes: {gene_count}",
        f"Samples: {sample_count}",
        f"Metadata rows: {metadata_rows}",
        f"Grouping column: {group_key}",
        "Normalization: library-size CPM",
        "PCA: covariance eigenvector approximation",
        "Differential: log2 fold change + pseudo p-value",
    ]
    with open(path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines) + "\n")


def action_validate(args: argparse.Namespace) -> None:
    summary = validate_inputs(args.matrix, args.metadata)
    print(json.dumps({"status": "ok", "action": "validate", "outputs": [], "summary": summary}))


def action_normalize(args: argparse.Namespace) -> None:
    gene_ids, sample_ids, values = read_matrix(args.matrix)
    metadata_rows, sample_key, group_key = read_metadata(args.metadata)
    validate_inputs(args.matrix, args.metadata)
    normalized = normalize_matrix(values)

    os.makedirs(args.output_dir, exist_ok=True)
    normalized_path = os.path.join(args.output_dir, "normalized_matrix.tsv")
    write_matrix(normalized_path, gene_ids, sample_ids, normalized)

    coords = compute_pca_coordinates(transpose(normalized))
    pca_path = os.path.join(args.output_dir, "pca_plot.svg")
    write_pca_plot(pca_path, sample_ids, coords)

    summary_path = os.path.join(args.output_dir, "summary_report.txt")
    write_summary(summary_path, len(gene_ids), len(sample_ids), len(metadata_rows), group_key)
    _ = sample_key
    print(json.dumps({"status": "ok", "action": "normalize", "outputs": [normalized_path, pca_path, summary_path]}))


def action_differential(args: argparse.Namespace) -> None:
    gene_ids, sample_ids, normalized = read_matrix(args.normalized_matrix)
    metadata_rows, sample_key, group_key = read_metadata(args.metadata)
    os.makedirs(args.output_dir, exist_ok=True)

    differential_path = os.path.join(args.output_dir, "differential_expression.tsv")
    points = write_differential(
        differential_path,
        gene_ids,
        sample_ids,
        normalized,
        metadata_rows,
        sample_key,
        group_key,
    )

    volcano_path = os.path.join(args.output_dir, "volcano_plot.svg")
    write_volcano(volcano_path, points)

    summary_path = os.path.join(args.output_dir, "summary_report.txt")
    write_summary(summary_path, len(gene_ids), len(sample_ids), len(metadata_rows), group_key)
    print(json.dumps({"status": "ok", "action": "differential", "outputs": [differential_path, volcano_path, summary_path]}))


def main() -> None:
    parser = argparse.ArgumentParser(description="Bulk RNA matrix-based downstream analysis script")
    parser.add_argument("--action", choices=["validate", "normalize", "differential"], required=True)
    parser.add_argument("--matrix", help="Path to count matrix input")
    parser.add_argument("--metadata", help="Path to metadata input")
    parser.add_argument("--normalized-matrix", help="Path to normalized matrix input")
    parser.add_argument("--output-dir", required=True, help="Output directory for analysis artifacts")
    args = parser.parse_args()

    if args.action == "validate":
        if not args.matrix or not args.metadata:
            fail("missing-argument", "--matrix and --metadata are required for validate action.")
        action_validate(args)
        return

    if args.action == "normalize":
        if not args.matrix or not args.metadata:
            fail("missing-argument", "--matrix and --metadata are required for normalize action.")
        action_normalize(args)
        return

    if args.action == "differential":
        if not args.normalized_matrix or not args.metadata:
            fail("missing-argument", "--normalized-matrix and --metadata are required for differential action.")
        action_differential(args)
        return


if __name__ == "__main__":
    main()
