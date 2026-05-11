"""
account_type_filter.py — Account-Type-Specific Fraud Pre-Filter (v2 — Speed Fixed)

Changes vs original:
  - Removed all df.at[] in loops → replaced with vectorized df.loc[mask] writes
  - Daily limit: two-pointer O(N) sliding window instead of O(N²) full-rescan
  - Velocity: same O(N) two-pointer pattern
  - Credit card daily check: same vectorized fix
  - All iterrows() removed
"""

from __future__ import annotations

import os
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

try:
    import yaml
    _YAML_AVAILABLE = True
except ImportError:
    _YAML_AVAILABLE = False

_DEFAULT_CONFIG_PATH = Path(__file__).parent / "account_thresholds.yaml"

_FALLBACK_CONFIG: dict[str, Any] = {
    "SAVINGS":     {"high_value_threshold": 50_000,    "velocity_window_minutes": 10, "velocity_tx_limit": 5,  "daily_limit": 100_000},
    "GENERAL":     {"high_value_threshold": 200_000,   "velocity_window_minutes": 10, "velocity_tx_limit": 10, "daily_limit": 500_000},
    "CURRENT":     {"high_value_threshold": 200_000,   "velocity_window_minutes": 10, "velocity_tx_limit": 10, "daily_limit": 500_000},
    "PREMIUM":     {"high_value_threshold": 1_000_000, "velocity_window_minutes": 10, "velocity_tx_limit": 15, "daily_limit": 2_500_000},
    "BUSINESS":    {"high_value_threshold": 5_000_000, "velocity_window_minutes": 10, "velocity_tx_limit": 30, "daily_limit": 20_000_000},
    "CREDIT_CARD": {"credit_limit_pct": 0.80, "credit_limit_default": 100_000, "velocity_window_minutes": 5, "velocity_tx_limit": 8},
    "DEFAULT":     "GENERAL",
}


def load_threshold_config(path: str | Path | None = None) -> dict[str, Any]:
    config_path = Path(path) if path else _DEFAULT_CONFIG_PATH

    if not _YAML_AVAILABLE:
        print("[account_type_filter] PyYAML not installed — using hardcoded fallback config.")
        return _FALLBACK_CONFIG

    if not config_path.exists():
        print(f"[account_type_filter] Config not found at {config_path} — using fallback.")
        return _FALLBACK_CONFIG

    with open(config_path, "r", encoding="utf-8") as fh:
        loaded = yaml.safe_load(fh)

    merged = dict(_FALLBACK_CONFIG)
    if isinstance(loaded, dict):
        merged.update(loaded)
    return merged


def _fmt_inr(value: float) -> str:
    return f"₹{int(value):,}"


def _get_account_cfg(account_type: str, config: dict) -> dict:
    atype = str(account_type).upper().strip()
    if atype in config and isinstance(config[atype], dict):
        return config[atype]
    default_key = config.get("DEFAULT", "GENERAL")
    fallback = config.get(default_key, config.get("GENERAL", {}))
    return fallback if isinstance(fallback, dict) else {}


def _two_pointer_velocity(
    sorted_ts: np.ndarray,
    window_ns: int,
    tx_limit: int,
) -> int | None:
    """
    O(N) two-pointer scan.
    Returns the index where velocity was first breached, or None.
    """
    left = 0
    for right in range(len(sorted_ts)):
        # Shrink window from left
        while int(sorted_ts[right]) - int(sorted_ts[left]) > window_ns:
            left += 1
        if (right - left + 1) > tx_limit:
            return left
    return None


def _two_pointer_daily(
    sorted_ts: np.ndarray,
    sorted_amounts: np.ndarray,
    daily_limit: float,
    window_ns: int,
) -> tuple[int, int] | None:
    """
    O(N) two-pointer scan for cumulative daily limit breach.
    Returns (left, right) indices of first breaching window, or None.
    """
    left      = 0
    window_sum = 0.0
    for right in range(len(sorted_ts)):
        window_sum += sorted_amounts[right]
        # Shrink window from left when outside 24h
        while int(sorted_ts[right]) - int(sorted_ts[left]) > window_ns:
            window_sum -= sorted_amounts[left]
            left += 1
        if window_sum > daily_limit:
            return (left, right)
    return None


def apply_account_type_filter(
    df: pd.DataFrame,
    config: dict[str, Any],
) -> tuple[pd.DataFrame, dict[str, list[str]]]:
    """
    Apply account-type-specific thresholds.
    All writes are vectorized — no df.at[] loops.
    """
    df = df.copy()

    if "account_type" not in df.columns:
        df["account_type"] = "GENERAL"
    else:
        df["account_type"] = (
            df["account_type"].fillna("GENERAL").str.upper().str.strip()
        )
        df["account_type"] = df["account_type"].replace("", "GENERAL")

    if "credit_limit" not in df.columns:
        default_cc_limit = config.get("CREDIT_CARD", {}).get("credit_limit_default", 100_000)
        df["credit_limit"] = float(default_cc_limit)

    df["rule_based_fraud"] = False
    df["flag_reason"]      = ""

    flag_reasons: dict[str, list[str]] = defaultdict(list)

    # 24h in nanoseconds (numpy datetime64 uses ns internally)
    TWENTY_FOUR_H_NS = int(24 * 3600 * 1e9)

    # ── Process each sender ───────────────────────────────────────────────── #
    for sender_id, grp in df.groupby("sender_id"):
        atype = str(grp["account_type"].iloc[0]).upper().strip()
        cfg   = _get_account_cfg(atype, config)
        if not cfg:
            continue

        is_cc = atype == "CREDIT_CARD"

        # Sort by timestamp for sliding window operations
        order        = np.argsort(grp["timestamp"].values)
        sorted_ts    = grp["timestamp"].values[order].astype(np.int64)
        sorted_amts  = grp["amount"].values[order].astype(float)
        sorted_idx   = grp.index[order]  # original df indices, sorted

        # ── 4a. High-value single transaction (non-CC) ──────────────────── #
        if not is_cc:
            hv_thresh = cfg.get("high_value_threshold")
            if hv_thresh is not None:
                hv_mask = grp["amount"].values > hv_thresh
                if hv_mask.any():
                    reason = (
                        f"Exceeded {atype} high-value threshold of "
                        f"{_fmt_inr(hv_thresh)} per transaction"
                    )
                    breach_indices = grp.index[hv_mask]
                    df.loc[breach_indices, "rule_based_fraud"] = True
                    df.loc[breach_indices, "flag_reason"] = reason
                    flag_reasons[sender_id].append(reason)

        # ── 4b. CREDIT_CARD: single tx > credit_limit_pct ────────────────── #
        if is_cc:
            cc_pct     = cfg.get("credit_limit_pct", 0.80)
            cc_limits  = grp["credit_limit"].values.astype(float)
            cc_amounts = grp["amount"].values.astype(float)
            cc_mask    = cc_amounts > (cc_limits * cc_pct)
            if cc_mask.any():
                # Use the first breach for the reason message
                first_i = np.argmax(cc_mask)
                reason  = (
                    f"CREDIT_CARD: single transaction {_fmt_inr(cc_amounts[first_i])} "
                    f"exceeds {int(cc_pct * 100)}% of credit limit "
                    f"{_fmt_inr(cc_limits[first_i])}"
                )
                breach_indices = grp.index[cc_mask]
                df.loc[breach_indices, "rule_based_fraud"] = True
                df.loc[breach_indices, "flag_reason"]      = reason
                flag_reasons[sender_id].append(reason)

        # ── 4c. Velocity — O(N) two-pointer ──────────────────────────────── #
        vel_window_min = cfg.get("velocity_window_minutes", 10)
        vel_tx_limit   = cfg.get("velocity_tx_limit")
        if vel_tx_limit is not None and len(sorted_ts) > vel_tx_limit:
            window_ns = int(vel_window_min * 60 * 1e9)
            breach_left = _two_pointer_velocity(sorted_ts, window_ns, vel_tx_limit)
            if breach_left is not None:
                # Count how many in that window
                window_end   = sorted_ts[breach_left] + window_ns
                in_win_mask  = (sorted_ts >= sorted_ts[breach_left]) & (sorted_ts <= window_end)
                count_in_win = int(in_win_mask.sum())
                reason = (
                    f"Exceeded {atype} velocity threshold: "
                    f"{count_in_win} transactions in {vel_window_min} minutes "
                    f"(limit: {vel_tx_limit})"
                )
                breach_indices = sorted_idx[in_win_mask]
                df.loc[breach_indices, "rule_based_fraud"] = True
                # Only set flag_reason where not already set
                empty_mask = df.loc[breach_indices, "flag_reason"] == ""
                df.loc[breach_indices[empty_mask], "flag_reason"] = reason
                flag_reasons[sender_id].append(reason)

        # ── 4d. Daily cumulative limit — O(N) two-pointer ────────────────── #
        if not is_cc:
            daily_limit = cfg.get("daily_limit")
            if daily_limit is not None:
                result = _two_pointer_daily(
                    sorted_ts, sorted_amts, float(daily_limit), TWENTY_FOUR_H_NS
                )
                if result is not None:
                    left_i, right_i = result
                    window_sum = float(sorted_amts[left_i : right_i + 1].sum())
                    reason = (
                        f"Exceeded {atype} daily limit of {_fmt_inr(daily_limit)} "
                        f"in 24 hours (total: {_fmt_inr(window_sum)})"
                    )
                    breach_indices = sorted_idx[left_i : right_i + 1]
                    df.loc[breach_indices, "rule_based_fraud"] = True
                    empty_mask = df.loc[breach_indices, "flag_reason"] == ""
                    df.loc[breach_indices[empty_mask], "flag_reason"] = reason
                    flag_reasons[sender_id].append(reason)

    # ── 5. CREDIT_CARD: cumulative daily spend > credit limit ─────────────── #
    cc_df = df[df["account_type"] == "CREDIT_CARD"]
    for sender_id, grp in cc_df.groupby("sender_id"):
        credit_limit_val = float(grp["credit_limit"].iloc[0])
        order       = np.argsort(grp["timestamp"].values)
        sorted_ts   = grp["timestamp"].values[order].astype(np.int64)
        sorted_amts = grp["amount"].values[order].astype(float)
        sorted_idx  = grp.index[order]

        result = _two_pointer_daily(
            sorted_ts, sorted_amts, credit_limit_val, TWENTY_FOUR_H_NS
        )
        if result is not None:
            left_i, right_i = result
            window_sum = float(sorted_amts[left_i : right_i + 1].sum())
            reason = (
                f"CREDIT_CARD: cumulative daily spend {_fmt_inr(window_sum)} "
                f"exceeds credit limit {_fmt_inr(credit_limit_val)}"
            )
            breach_indices = sorted_idx[left_i : right_i + 1]
            df.loc[breach_indices, "rule_based_fraud"] = True
            empty_mask = df.loc[breach_indices, "flag_reason"] == ""
            df.loc[breach_indices[empty_mask], "flag_reason"] = reason
            flag_reasons[sender_id].append(reason)

    total_flagged_rows = int(df["rule_based_fraud"].sum())
    total_flagged_accs = len(flag_reasons)
    print(
        f"[account_type_filter] Pre-filter complete: "
        f"{total_flagged_rows} rows flagged across {total_flagged_accs} accounts."
    )

    return df, dict(flag_reasons)