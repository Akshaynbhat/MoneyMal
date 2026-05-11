"""
flags.py — RBI/NPCI Rule Engine (v2 — Speed + Accuracy Fixed)

Changes vs original:
  - F2: Real dormancy detection (180-day gap, then burst), no hash fallback
  - F6: Real multi-account same-IP proxy via shared receiver pattern
  - F7: Removed (no real signal without device/mobile data)
  - F8: Real metro-mismatch proxy via amount distribution outlier
  - F9: Real new-account burst detection using account first-seen age
  - F10: Pre-computed cycle set injected from engine — no per-account DFS
  - All loops vectorized where possible for speed
"""

import hashlib
import pandas as pd
import numpy as np
import networkx as nx
from datetime import timedelta


# ──────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ──────────────────────────────────────────────────────────────────────────────

def _build_account_events(df: pd.DataFrame) -> pd.DataFrame:
    """Build combined sender+receiver event dataframe once."""
    s = df[["sender_id", "timestamp", "amount"]].rename(
        columns={"sender_id": "account", "amount": "amt"}
    ).assign(dir="out")
    r = df[["receiver_id", "timestamp", "amount"]].rename(
        columns={"receiver_id": "account", "amount": "amt"}
    ).assign(dir="in")
    events = pd.concat([s, r], ignore_index=True)
    events.sort_values(["account", "timestamp"], inplace=True)
    return events


def _first_last_seen(df: pd.DataFrame) -> tuple[dict, dict]:
    """Vectorized first/last seen per account."""
    s_first = df.groupby("sender_id")["timestamp"].min()
    r_first = df.groupby("receiver_id")["timestamp"].min()
    s_last  = df.groupby("sender_id")["timestamp"].max()
    r_last  = df.groupby("receiver_id")["timestamp"].max()

    all_accs = set(s_first.index) | set(r_first.index)
    first_seen, last_seen = {}, {}
    for acc in all_accs:
        candidates_f = []
        candidates_l = []
        if acc in s_first.index:
            candidates_f.append(s_first[acc])
            candidates_l.append(s_last[acc])
        if acc in r_first.index:
            candidates_f.append(r_first[acc])
            candidates_l.append(r_last[acc])
        first_seen[acc] = min(candidates_f)
        last_seen[acc]  = max(candidates_l)
    return first_seen, last_seen


# ──────────────────────────────────────────────────────────────────────────────
# Main entry point
# ──────────────────────────────────────────────────────────────────────────────

def run_all_flags(
    df: pd.DataFrame,
    G: nx.MultiDiGraph,
    accounts: list[str],
    cycle_accounts: set[str] | None = None,       # injected from engine
    long_cycle_accounts: set[str] | None = None,  # cycles length >= 4
) -> dict[str, list[str]]:
    """
    Run all RBI/NPCI rules against the list of accounts.
    Returns dict mapping account_id → list of triggered flag codes.

    Parameters
    ----------
    cycle_accounts       : set of accounts that appear in any detected cycle
    long_cycle_accounts  : set of accounts in cycles of length >= 4 (for F10)
    """
    flags_by_account: dict[str, list[str]] = {acc: [] for acc in accounts}

    if df.empty or not accounts:
        return flags_by_account

    cycle_accounts      = cycle_accounts      or set()
    long_cycle_accounts = long_cycle_accounts or set()

    accounts_set = set(accounts)

    # ── Pre-computations ──────────────────────────────────────────────────── #
    median_amt   = df["amount"].median() if not df.empty else 50_000
    dataset_span = (df["timestamp"].max() - df["timestamp"].min()).total_seconds()

    events_df = _build_account_events(df)
    acc_groups = events_df.groupby("account")

    first_seen, last_seen = _first_last_seen(df)

    # Vectorized: per-account total volume
    vol_out = df.groupby("sender_id")["amount"].sum()
    vol_in  = df.groupby("receiver_id")["amount"].sum()

    # Unique senders per receiver (for F3)
    unique_senders_per_acc = df.groupby("receiver_id")["sender_id"].nunique()

    # Shared receiver pattern: accounts that share the same top-3 receivers
    # Used as a proxy for "same device / coordinated group" (replaces fake F6 hash)
    top_receivers_by_acc: dict[str, frozenset] = {}
    for acc in accounts_set:
        out_edges = list(G.successors(acc))
        if out_edges:
            top_receivers_by_acc[acc] = frozenset(sorted(out_edges)[:5])

    # Build receiver-fingerprint → list of accounts (for F6 real detection)
    fingerprint_to_accs: dict[frozenset, list[str]] = {}
    for acc, fp in top_receivers_by_acc.items():
        if len(fp) >= 2:
            fingerprint_to_accs.setdefault(fp, []).append(acc)
    # Accounts sharing identical top-receiver fingerprint with 3+ others
    shared_fingerprint_accs: set[str] = set()
    for fp, accs in fingerprint_to_accs.items():
        if len(accs) >= 3:
            shared_fingerprint_accs.update(accs)

    # ── Per-account flag evaluation ───────────────────────────────────────── #
    for acc in accounts:
        if acc not in acc_groups.groups:
            continue

        grp  = acc_groups.get_group(acc)
        dirs = grp["dir"].values
        ts   = grp["timestamp"].values
        amts = grp["amt"].values

        in_idx  = np.where(dirs == "in")[0]
        out_idx = np.where(dirs == "out")[0]

        total_vol = float(vol_out.get(acc, 0)) + float(vol_in.get(acc, 0))

        # ── F1: ≥90% of inbound re-transmitted within 2 hours ────────────── #
        f1_triggered = False
        two_hours = np.timedelta64(2, "h")
        if len(in_idx) > 0 and len(out_idx) > 0:
            for i in in_idx:
                mask = (ts > ts[i]) & (ts <= ts[i] + two_hours) & (dirs == "out")
                if amts[mask].sum() >= 0.90 * amts[i]:
                    f1_triggered = True
                    break
        if f1_triggered:
            flags_by_account[acc].append("F1")

        # ── F2: Real dormancy → burst (180-day gap then 3+ tx in 24h) ──────── #
        f2_triggered = False
        if len(ts) >= 4:
            gaps_days = np.diff(ts).astype("timedelta64[D]").astype(int)
            dormant_positions = np.where(gaps_days > 180)[0]
            if dormant_positions.size > 0:
                # After the dormant gap, check for burst within 24h
                for pos in dormant_positions:
                    burst_start = ts[pos + 1]
                    burst_end   = burst_start + np.timedelta64(24, "h")
                    burst_count = int(np.sum((ts >= burst_start) & (ts <= burst_end)))
                    if burst_count >= 3:
                        f2_triggered = True
                        break
            elif dataset_span > 0 and dataset_span < 30 * 86400:
                # Short dataset: use 30-day dormancy threshold as fallback
                dormant_positions_30 = np.where(gaps_days > 30)[0]
                if dormant_positions_30.size > 0:
                    for pos in dormant_positions_30:
                        burst_start = ts[pos + 1]
                        burst_end   = burst_start + np.timedelta64(24, "h")
                        burst_count = int(np.sum((ts >= burst_start) & (ts <= burst_end)))
                        if burst_count >= 3:
                            f2_triggered = True
                            break
        if f2_triggered:
            flags_by_account[acc].append("F2")

        # ── F3: 50+ small payments (<500) from 25+ unique senders ───────────── #
        small_in_mask = (dirs == "in") & (amts < 500)
        if small_in_mask.sum() >= 50:
            unique_s = int(unique_senders_per_acc.get(acc, 0))
            if unique_s >= 25:
                flags_by_account[acc].append("F3")

        # ── F4: Total volume > 10× median × 20 ────────────────────────────── #
        if total_vol > (10 * median_amt * 20):
            flags_by_account[acc].append("F4")

        # ── F5: 4+ outbound within 1 hour of receiving ──────────────────────── #
        f5_triggered = False
        for i in in_idx:
            mask_out = (ts > ts[i]) & (ts <= ts[i] + np.timedelta64(1, "h")) & (dirs == "out")
            if mask_out.sum() >= 4:
                f5_triggered = True
                break
        if f5_triggered:
            flags_by_account[acc].append("F5")

        # ── F6: Real coordinated-group signal (shared receiver fingerprint) ─── #
        # Replaces fake MD5 hash — only flags accounts that genuinely share
        # identical top-receiver patterns with 2+ other accounts.
        if acc in shared_fingerprint_accs:
            flags_by_account[acc].append("F6")

        # ── F7: REMOVED — no real device/mobile data available ──────────────── #
        # (was 100% random hash — removed to stop false positives)

        # ── F8: Unusually large amounts for a low-activity account ───────────── #
        # Proxy for "small-town account, metro-level transactions"
        # Real signal: account's max transaction is > 5× their own median AND
        # their median is < 30% of dataset median (low-value account profile)
        if len(amts) >= 3:
            own_median = float(np.median(amts))
            own_max    = float(np.max(amts))
            if (own_median < 0.30 * median_amt) and (own_max > 5 * own_median):
                flags_by_account[acc].append("F8")

        # ── F9: New account (< 7 days old) with high-value transactions ──────── #
        # Replaces fake hash — real detection using first_seen timestamp
        acc_first = first_seen.get(acc)
        acc_last  = last_seen.get(acc)
        if acc_first is not None and acc_last is not None:
            account_age_days = (acc_last - acc_first).total_seconds() / 86400
            high_val_count = int(np.sum(amts > median_amt * 3))
            if account_age_days < 7 and high_val_count >= 2:
                flags_by_account[acc].append("F9")

        # ── F10: Part of cycle of length >= 4 (pre-computed by engine) ──────── #
        if acc in long_cycle_accounts:
            flags_by_account[acc].append("F10")

    return flags_by_account