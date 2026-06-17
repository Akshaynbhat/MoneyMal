"""
data_ingestion.py — Column mapping preview for CSV uploads.
Lets the frontend show the user how their columns will be
interpreted BEFORE running full analysis.
"""
import pandas as pd
from rapidfuzz import fuzz

CANONICAL_ALIASES = {
    'transaction_id': ['txn_id', 'id', 'ref_no', 'trx_id', 'tx_id',
                        'transactionid', 'txnid'],
    'sender_id': ['from_account', 'payer_id', 'originator', 'sender',
                   'from', 'nameorig', 'orig_acct', 'source',
                   'source_id', 'source_account', 'sender_account',
                   'origin', 'origin_id', 'origin_account',
                   'debit_account', 'payer', 'sender_account_id'],
    'receiver_id': ['to_account', 'payee_id', 'beneficiary',
                     'destination', 'to', 'namedest', 'bene_acct',
                     'receiver', 'receiver_account', 'dest',
                     'dest_id', 'dest_account', 'credit_account',
                     'payee', 'receiver_account_id', 'target',
                     'target_account'],
    'amount': ['txn_amount', 'transaction_amount', 'amt', 'value',
               'tx_amount', 'amount_inr', 'amount_usd', 'sum',
               'transferamount', 'transfer_amount'],
    'timestamp': ['date', 'txn_date', 'created_at', 'datetime',
                   'time', 'step', 'transaction_date', 'date_time',
                   'txn_time', 'transaction_time'],
    'account_type': ['acc_type', 'type', 'accounttype'],
    'credit_limit': ['limit', 'creditlimit'],
}

def normalize_column_name(col: str) -> str:
    """Strip spaces, underscores, lowercase — for loose comparison."""
    return col.lower().strip().replace(' ', '').replace('_', '').replace('-', '')

def build_column_mapping(df: pd.DataFrame) -> dict:
    df_cols_norm = {normalize_column_name(c): c for c in df.columns}
    df_cols_lower = {c.lower().strip(): c for c in df.columns}
    mapping = {}
    warnings = []

    for canonical, aliases in CANONICAL_ALIASES.items():
        matched_original = None
        match_type = None
        canonical_norm = normalize_column_name(canonical)

        # 1. Exact match (case-insensitive)
        if canonical in df_cols_lower:
            matched_original = df_cols_lower[canonical]
            match_type = "exact"
        # 2. Normalized exact match (ignores _, -, spaces)
        elif canonical_norm in df_cols_norm:
            matched_original = df_cols_norm[canonical_norm]
            match_type = "exact (normalized)"
        else:
            # 3. Alias list match (normalized)
            for alias in aliases:
                alias_norm = normalize_column_name(alias)
                if alias_norm in df_cols_norm:
                    matched_original = df_cols_norm[alias_norm]
                    match_type = f"alias ({alias})"
                    break

        # 4. Fuzzy fallback — only if nothing matched yet
        if not matched_original:
            best_score = 0
            best_col = None
            for orig_col in df.columns:
                score = fuzz.ratio(canonical_norm, normalize_column_name(orig_col))
                # Also check against every alias
                for alias in aliases:
                    score = max(score, fuzz.ratio(
                        normalize_column_name(alias),
                        normalize_column_name(orig_col)
                    ))
                if score > best_score:
                    best_score = score
                    best_col = orig_col
            if best_score >= 70:   # lowered from 75 — more forgiving
                matched_original = best_col
                match_type = f"fuzzy ({best_score}%)"

        if matched_original:
            mapping[canonical] = {
                "original_column": matched_original,
                "match_type": match_type,
            }
        else:
            mapping[canonical] = None
            required = canonical in (
                'transaction_id', 'sender_id', 'receiver_id',
                'amount', 'timestamp'
            )
            if required:
                warnings.append(f"Could not map '{canonical}'")

    # Preview first 5 rows using the mapping
    preview_rows = []
    rename_map = {v["original_column"]: k for k, v in mapping.items() if v}
    preview_df = df.rename(columns=rename_map)
    mapped_cols = [c for c in preview_df.columns if c in CANONICAL_ALIASES]
    if mapped_cols:
        preview_rows = preview_df[mapped_cols].head(5).fillna("").to_dict(
            orient="records"
        )

    return {
        "mapping": mapping,
        "warnings": warnings,
        "preview_rows": preview_rows,
        "total_rows": len(df),
        "total_columns": len(df.columns),
        "available_columns": list(df.columns),   # CRITICAL — show user
    }
