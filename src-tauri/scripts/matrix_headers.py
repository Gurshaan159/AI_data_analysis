"""
Shared gene/feature column header rules for count-matrix style TSV/CSV inputs.

Used by count_matrix_analysis.py and bulk_rna_matrix_analysis.py only (pipeline lane).
"""

from __future__ import annotations

import re
from typing import FrozenSet

# Normalized with normalize_gene_identifier_header(); keep this list small and explicit.
ALLOWED_NORMALIZED_GENE_IDENTIFIER_HEADERS: FrozenSet[str] = frozenset(
    {
        "gene_id",
        "gene",
        "genes",
        "ensembl_id",
        "ensembl_gene_id",
        "geneid",
        "gene_symbol",
        "symbol",
    }
)


def normalize_gene_identifier_header(raw: str) -> str:
    """Trim, lowercase, treat spaces and hyphens like underscores, collapse repeats."""
    s = raw.strip().lower()
    s = s.replace("-", "_")
    s = re.sub(r"\s+", "_", s)
    s = re.sub(r"_+", "_", s)
    return s.strip("_")


def is_allowed_gene_identifier_header(raw: str) -> bool:
    if not raw or not raw.strip():
        return False
    return normalize_gene_identifier_header(raw) in ALLOWED_NORMALIZED_GENE_IDENTIFIER_HEADERS


def _run_self_tests() -> None:
    # Accept: canonical and aliases
    for h in (
        "gene_id",
        "gene",
        "genes",
        "ensembl_id",
        "Ensembl_ID",
        "ENSEMBL_ID",
        "ensembl_gene_id",
        "geneid",
        "GeneID",
        "gene_symbol",
        "symbol",
        "gene id",
        "Gene ID",
        "ensembl-id",
        "ensembl__id",
    ):
        assert is_allowed_gene_identifier_header(h), h

    # Reject: wrong role / not a gene column
    for h in ("sample", "expression", "count", "", "   ", "probe_id"):
        assert not is_allowed_gene_identifier_header(h), repr(h)

    # Normalization spot-checks
    assert normalize_gene_identifier_header("  Ensembl_ID  ") == "ensembl_id"
    assert normalize_gene_identifier_header("gene id") == "gene_id"


if __name__ == "__main__":
    _run_self_tests()
    print("matrix_headers self-tests OK")
