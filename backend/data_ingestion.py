"""
data_ingestion.py — Flexible CSV normalisation layer for MoneyMal.

Steps performed for every uploaded file:
  1. Exact-match against known column aliases (case-insensitive).
  2. Fuzzy-match (rapidfuzz ratio > 80) for any remaining unmapped columns.
  3. Graceful fallback: surrogate row-index IDs if sender/receiver are absent.
  4. Validation: numeric + positive amounts, multi-format timestamps, null handling.
  5. Returns a UI-ready preview (first 5 rows) with a mapping summary and warnings.
"""

import json
import re

import numpy as np
import pandas as pd
from rapidfuzz import fuzz, process


# ──────────────────────────────────────────────────────────────────────────────
# Alias catalogue
# ──────────────────────────────────────────────────────────────────────────────
ALTERNATIVES: dict[str, list[str]] = {
    "sender_id": [
        "sender_id", "from_account", "payer_id", "source_account",
        "account_no", "from_id", "user_id", "sender", "from",
        "sender_account", "sender_ac", "originator", "src_account",
    ],
    "receiver_id": [
        "receiver_id", "to_account", "payee_id", "dest_account",
        "beneficiary_id", "to_id", "receiver", "to", "beneficiary",
        "receiver_account", "destination", "dst_account",
    ],
    "amount": [
        "amount", "txn_amount", "transaction_amount", "value",
        "transfer_amount", "debit_amount", "credit_amount",
        "amt", "sum", "total",
    ],
    "timestamp": [
        "timestamp", "date", "txn_date", "transaction_date",
        "created_at", "datetime", "time", "trans_date", "trans_time",
        "posted_date", "settlement_date",
    ],
    "transaction_id": [
        "transaction_id", "txn_id", "id", "ref_no", "reference",
        "trans_id", "tran_id", "trx_id",
    ],
}

REQUIRED_COLS = ["sender_id", "receiver_id", "amount", "timestamp"]
ALL_COLS = REQUIRED_COLS + ["transaction_id"]

# ──────────────────────────────────────────────────────────────────────────────
# Timestamp format trials  (epoch is handled separately)
# ──────────────────────────────────────────────────────────────────────────────
TIMESTAMP_FORMATS = [
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%S.%f",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d",
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y",
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y",
    "%m/%d/%Y %H:%M:%S",
    "%m/%d/%Y",
    "%Y%m%d",
]


def _try_parse_timestamps(series: pd.Series) -> pd.Series:
    """
    Try multiple strategies to coerce a Series to datetime:
      1. pandas 'mixed' mode (covers ISO and many locale formats)
      2. Each explicit format in TIMESTAMP_FORMATS
      3. Unix-epoch (seconds or milliseconds) if the column looks numeric
    Returns a datetime Series (NaT for failures).
    """
    # Strategy 1 – pandas mixed parser
    try:
        parsed = pd.to_datetime(series, format="mixed", errors="coerce")
        if parsed.notna().mean() >= 0.5:          # at least 50 % parsed
            return parsed
    except Exception:
        pass

    # Strategy 2 – explicit format loop
    for fmt in TIMESTAMP_FORMATS:
        try:
            parsed = pd.to_datetime(series, format=fmt, errors="coerce")
            if parsed.notna().mean() >= 0.5:
                return parsed
        except Exception:
            continue

    # Strategy 3 – numeric epoch
    numeric = pd.to_numeric(series, errors="coerce")
    if numeric.notna().mean() >= 0.5:
        # Distinguish seconds vs milliseconds by magnitude
        median_val = numeric.median()
        if median_val > 1e12:          # milliseconds
            return pd.to_datetime(numeric, unit="ms", errors="coerce")
        else:                          # seconds
            return pd.to_datetime(numeric, unit="s", errors="coerce")

    # Fallback – best-effort
    return pd.to_datetime(series, errors="coerce")


# ──────────────────────────────────────────────────────────────────────────────
# Main class
# ──────────────────────────────────────────────────────────────────────────────
class DataIngestor:
    """Normalises an arbitrary transaction CSV into the canonical schema."""

    def normalize_dataframe(self, df: pd.DataFrame) -> dict:
        """
        Parameters
        ----------
        df : pd.DataFrame
            Raw dataframe straight from pd.read_csv.

        Returns
        -------
        dict with keys:
            df              – cleaned, canonically-named dataframe
            mapping_summary – {original_col: canonical_col}
            warnings        – list of human-readable warning strings
            preview         – first 5 rows as list-of-dicts (JSON-safe)
        """
        original_cols = df.columns.tolist()
        # Build a lowercase → original-name lookup (strip whitespace)
        lower_to_orig: dict[str, str] = {
            col.strip().lower(): col for col in original_cols
        }
        available_lower = list(lower_to_orig.keys())

        mapping_summary: dict[str, str] = {}   # original → canonical
        warnings: list[str] = []

        # ── Step 1 + 2: exact then fuzzy matching ──────────────────────────
        for canonical in ALL_COLS:
            aliases = ALTERNATIVES[canonical]
            matched_lower: str | None = None

            # Exact match (case-insensitive)
            for alias in aliases:
                if alias in available_lower:
                    matched_lower = alias
                    break

            # Fuzzy match if no exact hit
            if matched_lower is None and available_lower:
                best_col: str | None = None
                best_score = 0
                for alias in aliases:
                    result = process.extractOne(
                        alias, available_lower, scorer=fuzz.ratio
                    )
                    if result:
                        col_candidate, score, _ = result
                        if score > 80 and score > best_score:
                            best_score = score
                            best_col = col_candidate
                matched_lower = best_col

            # Apply rename if we found something
            if matched_lower is not None:
                orig_name = lower_to_orig[matched_lower]
                if orig_name != canonical:          # skip no-op renames
                    df.rename(columns={orig_name: canonical}, inplace=True)
                    mapping_summary[orig_name] = canonical
                else:
                    mapping_summary[canonical] = canonical
                # Remove from available pool to prevent double-mapping
                available_lower.remove(matched_lower)
                del lower_to_orig[matched_lower]

            # ── Step 3: graceful fallback for absent columns ───────────────
            else:
                if canonical in ("sender_id", "receiver_id"):
                    warnings.append(
                        f"⚠ Column '{canonical}' not found — "
                        f"using row index as surrogate ID."
                    )
                    df[canonical] = [
                        f"surrogate_{canonical}_{i}" for i in range(len(df))
                    ]
                elif canonical == "transaction_id":
                    df[canonical] = [f"txn_{i}" for i in range(len(df))]
                elif canonical == "amount":
                    warnings.append(
                        "⚠ 'amount' column not found — defaulting to 0.0."
                    )
                    df[canonical] = 0.0
                elif canonical == "timestamp":
                    warnings.append(
                        "⚠ 'timestamp' column not found — "
                        "defaulting to current time."
                    )
                    df[canonical] = pd.Timestamp.now()

        # ── Step 4a: amount validation ─────────────────────────────────────
        if "amount" in df.columns:
            df["amount"] = pd.to_numeric(df["amount"], errors="coerce")
            median_amt = df["amount"].median()
            if pd.isna(median_amt):
                median_amt = 0.0

            n_null = int(df["amount"].isna().sum())
            if n_null:
                warnings.append(
                    f"⚠ Filled {n_null} missing/non-numeric amounts with "
                    f"median ({median_amt:,.2f})."
                )
                df["amount"] = df["amount"].fillna(median_amt)

            n_neg = int((df["amount"] <= 0).sum())
            if n_neg:
                warnings.append(
                    f"⚠ Corrected {n_neg} zero/negative amounts "
                    f"(negatives → absolute value; zeros → 1.0)."
                )
                df["amount"] = df["amount"].apply(
                    lambda x: abs(x) if x < 0 else (1.0 if x == 0 else x)
                )

        # ── Step 4b: timestamp validation ──────────────────────────────────
        if "timestamp" in df.columns:
            df["timestamp"] = _try_parse_timestamps(df["timestamp"])
            n_bad = int(df["timestamp"].isna().sum())
            if n_bad:
                warnings.append(
                    f"⚠ Dropped {n_bad} rows with unparseable timestamps."
                )
                df = df.dropna(subset=["timestamp"])

        # ── Step 4c: cast IDs to string ────────────────────────────────────
        for id_col in ("sender_id", "receiver_id", "transaction_id"):
            if id_col in df.columns:
                df[id_col] = df[id_col].astype(str).str.strip()

        # ── Build human-readable mapping message ───────────────────────────
        mapped_msgs = []
        for orig, canon in mapping_summary.items():
            if orig != canon:
                mapped_msgs.append(f"'{orig}' → {canon}")
        if mapped_msgs:
            warnings.insert(
                0, "✓ Column mapping: " + ", ".join(mapped_msgs)
            )

        # ── Step 5: preview (first 5 rows, JSON-safe) ─────────────────────
        preview_df = df.head(5).copy()
        # Keep only canonical + any extra columns
        preview_rows = json.loads(
            preview_df.to_json(orient="records", date_format="iso")
        )

        # Tag which columns were mapped (for UI highlighting)
        mapped_canonicals = set(mapping_summary.values())

        return {
            "df": df,
            "mapping_summary": mapping_summary,
            "mapped_canonicals": list(mapped_canonicals),
            "warnings": warnings,
            "preview": preview_rows,
            "preview_columns": preview_df.columns.tolist(),
        }
