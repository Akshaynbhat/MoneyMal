# 🛡️ MoneyMal — Financial Forensics Engine

> Graph-based money muling detection engine / Financial Crime Detection

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![NetworkX](https://img.shields.io/badge/NetworkX-Graph_Theory-orange)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-GAT_|_LSTM_|_EIF-F7931E)
![Architecture](https://img.shields.io/badge/Architecture-Async_Job_Queue-9cf)
![Accuracy](https://img.shields.io/badge/F1_Score-50.7%25_(IBM_AMLSim)-brightgreen)

🔗 **Deployment link**
https://money-mal-nxch.vercel.app/

---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Async Job Architecture](#async-job-architecture)
- [CSV Ingestion & Column Mapping](#csv-ingestion--column-mapping)
- [Detection Pipeline](#detection-pipeline)
- [RBI/NPCI Rules Engine](#rbinpci-rules-engine)
- [Account-Type Thresholds](#account-type-thresholds)
- [4-Pillar Scoring & Decisions](#4-pillar-scoring--decisions)
- [Structural Roles](#structural-roles)
- [Node Inspector Panel](#node-inspector-panel)
- [Installation & Setup](#installation--setup)
- [Usage Instructions](#usage-instructions)
- [Performance Benchmarks](#performance-benchmarks)
- [Accuracy Benchmarks](#accuracy-benchmarks)
- [Known Limitations](#known-limitations)
- [Changelog](#changelog)
- [Team Members](#team-members)

---

## Overview

MoneyMal is an advanced web-based financial forensics engine that processes transaction CSV data and exposes money muling networks through graph analysis and interactive visualization. It integrates a **4-pillar Machine Learning Pipeline (GAT, LSTM, EIF, Rules)** alongside **RBI/NPCI-compliant fraud detection rules** to identify circular fund routing, smurfing, fan-out distribution, layered shell networks, structuring, and bipartite scatter-gather patterns.

It actively assigns structural roles (HUB, BRIDGE, MULE, LEAF) to exposed network entities and generates concrete enforcement decisions (BLOCK / REVIEW / APPROVE), and now ships with an **automatic column-mapping layer** so CSVs with non-standard headers still work without manual reformatting, plus a **5-tab Node Inspector** for drilling into any flagged account.

### Key Features

- **Flexible CSV Ingestion with Fuzzy Column Mapping:** auto-detects sender/receiver/amount/timestamp columns even under unusual names, with a pre-upload preview so mismatches are caught before analysis runs.
- **Async Job Architecture:** uploads return instantly; the engine runs in a background thread with no HTTP timeout, so even multi-million-row files can be processed without failing.
- **Account-Type Pre-Filter:** separate fraud thresholds for Savings, General, Premium, Business, and Credit Card accounts.
- **7 Detection Algorithms:** cycles, shell chains, smurfing (fan-in), fan-out, bipartite/scatter-gather, structuring, and velocity bursts.
- **4-Pillar ML Scoring:** Graph Attention proxy (PageRank), LSTM-style burst timing, Extended Isolation Forest, and RBI rule scoring, combined with role multipliers.
- **Node Inspector Panel:** click any account in the graph to open a 5-tab deep-dive — Overview, Transactions, Ring, Connected Accounts, ML Scores.
- **Enforcement Decisions:** automated BLOCK, REVIEW, or APPROVE verdicts per account.
- **Downloadable JSON report**, fraud ring summary table, and dark "Threat Matrix" UI.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, vis-network (vis.js), Tailwind CSS 4, Framer Motion |
| **Backend** | Python 3.10+, FastAPI, Uvicorn, ThreadPoolExecutor (async jobs) |
| **Graph Engine** | NetworkX (MultiDiGraph) |
| **ML & AI** | scikit-learn (Isolation Forest), PageRank/Degree Centrality, Burst Timing Analysis |
| **Numerical** | NumPy, Pandas |
| **Fuzzy Column Mapping** | rapidfuzz |
| **Config** | PyYAML (account thresholds) |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────┐  │
│  │ Landing  │  │NetworkGraph  │  │FraudTable│  │  Node  │  │
│  │ Mapping  │  │ Interactive  │  │ Ring     │  │Inspector│  │
│  │ Preview  │  │ Graph        │  │ Summary  │  │ 5 Tabs  │  │
│  └────┬─────┘  └──────────────┘  └──────────┘  └────────┘  │
│       │  POST /api/preview_mapping (instant, no analysis)   │
│       │  POST /api/analyze → {job_id}                       │
│       │  GET  /api/result/{job_id} (poll every 3s)          │
├───────┼─────────────────────────────────────────────────────┤
│       ▼              BACKEND (FastAPI, async job queue)     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  data_ingestion.py — fuzzy column mapping (rapidfuzz) │   │
│  │  ForensicsEngine (background thread, no timeout)     │   │
│  │                                                      │   │
│  │  1. load_data() ──── MultiDiGraph construction       │   │
│  │  2. detect_cycles() ─ Union-Find bounded DFS          │   │
│  │  3. detect_shells() ─ Passthrough chain walking       │   │
│  │  4. detect_velocity() ─ Burst + 24h window            │   │
│  │  5. detect_smurfing() ─ Fan-in sliding window          │   │
│  │  6. detect_fan_out() ─ Fan-out distribution            │   │
│  │  7. detect_bipartite() ─ Scatter-gather detection       │   │
│  │  8. detect_structuring() ─ Band + window scan          │   │
│  │  9. consolidate_rings() ─ Jaccard merge                │   │
│  │ 10. calculate_suspicion_scores()                      │   │
│  │     ├── apply_rbi_rules() ─ F1–F10 adaptive rules     │   │
│  │     ├── assign_structural_roles() ─ HUB/BRIDGE/MULE   │   │
│  │     └── 4-pillar ML scoring                          │   │
│  │ 11. generate_json() + get_graph_data()                │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Async Job Architecture

Large files (millions of transactions) used to hit a hard 120-second HTTP timeout and fail outright. MoneyMal now uses a **submit-and-poll job queue**:

1. The CSV is uploaded to `POST /api/analyze` — the server immediately returns a `job_id` and runs the actual engine in a background thread.
2. The frontend polls `GET /api/result/{job_id}` every 3 seconds, displaying live progress messages (`Detecting cycles...`, `Running ML scoring...`, etc.).
3. There is no upper bound on processing time from the HTTP layer — a 5-million-row file simply takes longer, it does not fail.
4. Maximum client-side wait is capped at 15 minutes as a sane upper bound; everything below that completes silently with live status updates.

This replaced the previous synchronous request/response pattern that caused `timeout of 120000ms exceeded` errors on large uploads.

---

## CSV Ingestion & Column Mapping

CSVs rarely use MoneyMal's exact column names, so every upload goes through a fuzzy column-mapping layer in `backend/data_ingestion.py` before any detection runs.

**Matching order, most confident first:**
1. **Exact match** — column name is identical to the canonical name (`sender_id`, `amount`, etc.)
2. **Normalized exact match** — ignores casing, spaces, underscores, and hyphens (`Sender_ID` and `senderid` both match)
3. **Alias list match** — checks against a curated list of known synonyms per field (`from_account`, `nameOrig`, `payer_id`, `debit_account`, etc.)
4. **Fuzzy match** — uses `rapidfuzz` string similarity; any column scoring ≥ 70% similarity against the canonical name or its aliases is accepted

**Canonical fields and example aliases:**

| Canonical Field | Example Aliases Recognized |
|---|---|
| `transaction_id` | `txn_id`, `id`, `ref_no`, `trx_id`, `tx_id` |
| `sender_id` | `from_account`, `payer_id`, `originator`, `nameOrig`, `orig_acct`, `source_account`, `debit_account` |
| `receiver_id` | `to_account`, `payee_id`, `beneficiary`, `nameDest`, `bene_acct`, `dest_account`, `credit_account` |
| `amount` | `txn_amount`, `transaction_amount`, `amt`, `value`, `transfer_amount` |
| `timestamp` | `date`, `txn_date`, `created_at`, `datetime`, `step`, `transaction_time` |
| `account_type` | `acc_type`, `type` |
| `credit_limit` | `limit` |

**Pre-upload preview:** before running the full analysis, the frontend calls `POST /api/preview_mapping` with the selected file. This returns the detected mapping for every canonical field, the match type used (exact / alias / fuzzy with confidence %), and the file's actual column list — so a mismatch is visible and fixable *before* committing to a full run, instead of failing with a generic `Missing required columns` error after upload.

If a required field (`sender_id`, `receiver_id`, `amount`, `timestamp`) cannot be mapped at all, the error message now lists the file's actual columns so the fix is obvious, rather than failing silently.

---

## Detection Pipeline

The engine runs 7 detection stages in sequence before scoring:

| Stage | Method | What It Catches |
|---|---|---|
| **Cycle Detection** | Bounded DFS + Union-Find merge | Circular fund routing (A→B→C→A) |
| **Shell Detection** | Passthrough ratio + chain walking | Layered shell account networks |
| **Velocity Detection** | Two-tier sliding window | Rapid in→out within 1h; bursts within 24h |
| **Smurfing (Fan-In)** | Many-senders→one-hub sliding window | Aggregation before layering |
| **Fan-Out** | One-sender→many-receivers sliding window | Rapid distribution / scattering |
| **Bipartite / Scatter-Gather** | Shared bidirectional counterparty sets | Money bouncing between two account clusters |
| **Structuring Detection** | Band filter + two-pointer window | Repeated transactions just below reporting limits |
| **Business Immunity** | Payroll/merchant pattern matching | Suppresses legitimate high-volume accounts |

---

## RBI/NPCI Rules Engine

Adaptive, percentile-based rules computed relative to each dataset's own statistics (no hardcoded absolute thresholds), so the same rule set scales correctly whether the upload is 1,000 or 1,000,000 transactions:

| Flag | Rule | Detection Method |
|---|---|---|
| **F1** | ≥90% of inbound re-transmitted within 2 hours | Vectorized time-window scan |
| **F2** | Dormant account suddenly bursts (gap ≥ 30% of dataset span) | Real gap detection + burst count |
| **F3** | 50+ small payments (<₹500) from 25+ unique senders | Aggregated groupby count, adaptive percentile |
| **F4** | Total transaction volume exceeds 3× the 99th percentile amount | Volume threshold check, scale-invariant |
| **F5** | 4+ outbound transactions within 1 hour of receiving | Per-event rolling window |
| **F6** | Coordinated group — shares identical top-receiver with 3+ accounts | Receiver fingerprint matching |
| **F7** | Low-value account profile with outlier high-value transaction | Max/median ratio + coefficient of variation |
| **F8** | New account (relative to dataset span) with 2+ high-value transactions | First-seen age check, adaptive |
| **F9** | New account with abnormally high transaction *count* (not just value) | Distinguishes burst-count fraud from F8's burst-value fraud |
| **F10** | Rapid counterparty diversity — 5+ distinct counterparties within 24 hours | Generic layering signal, works on any account ID format |

> F10 was previously tied to a specific account-naming convention (`BNK_XX_ACC_YYYY`) and silently never fired on datasets using plain numeric or alphanumeric IDs. It has been generalized to detect rapid counterparty diversity regardless of ID format.

---

## Account-Type Thresholds

Separate fraud thresholds per account type, configurable in `backend/account_thresholds.yaml` without touching code.

| Account Type | Single Tx Limit | Velocity (10 min) | Daily Limit |
|---|---|---|---|
| **SAVINGS** | ₹50,000 | 5 transactions | ₹1,00,000 |
| **GENERAL / CURRENT** | ₹2,00,000 | 10 transactions | ₹5,00,000 |
| **PREMIUM** | ₹10,00,000 | 15 transactions | ₹25,00,000 |
| **BUSINESS** | ₹50,00,000 | 30 transactions | ₹2,00,00,000 |
| **CREDIT_CARD** | 80% of credit limit | 8 tx in 5 min | Credit limit |

Any threshold breach sets `rule_based_fraud = True` on the transaction row and boosts the Rules pillar score, ensuring breached accounts cannot be suppressed below REVIEW.

To change thresholds, edit `backend/account_thresholds.yaml` directly:
```yaml
SAVINGS:
  high_value_threshold: 50000
  velocity_tx_limit: 5
  velocity_window_minutes: 10
  daily_limit: 100000
```

---

## 4-Pillar Scoring & Decisions

Each account is scored across four independent pillars, then combined into a final weighted score:

| Pillar | Weight | What It Measures |
|---|---|---|
| **GAT** | 35% | Graph centrality (PageRank / degree, size-guarded for large graphs) + cycle/smurfing/fan-out membership bonus |
| **LSTM** | 25% | Transaction burst timing — dampened for legitimate high-volume (immune) accounts |
| **EIF** | 20% | Isolation Forest on behavioural features (degree, volume, count, diversity, balance ratio) |
| **Rules** | 20% | RBI flag hits (F1–F10) + account-type threshold breach bonus |

Role multipliers (HUB: 1.25×, BRIDGE: 1.15×, MULE: 1.10×, LEAF: 1.0×) amplify the score based on structural position.

### Enforcement Matrix

| Combined Score | Verdict | Action |
|---|---|---|
| **0 – 39** | **APPROVE** | Cleared for normal operations |
| **40 – 74** | **REVIEW** | Flagged for manual analyst verification |
| **75 – 100** | **BLOCK** | Immediate system blackout and asset freeze |

Accounts that trigger a strong fraud pattern (cycle, shell, smurfing, or a high-confidence RBI flag) are guaranteed a minimum score that lands them at REVIEW or above, even if the weighted average alone would have placed them lower — fraud signal cannot be diluted away by an otherwise quiet transaction history.

---

## Structural Roles

| Role | Visual | Description |
|---|---|---|
| **HUB** | 🟣 Purple | Central aggregator with highest degree in the ring |
| **BRIDGE** | 🟠 Orange | Connects ring members to outside accounts — cross-network relay |
| **MULE** | 🟡 Yellow | Forwarder — has both inbound and outbound, medium degree |
| **LEAF** | 🔵 Blue | Peripheral node — entry/exit point of the network |

---

## Node Inspector Panel

Clicking any node in the Network Graph (or any account row in the Dashboard) opens a slide-in panel with five tabs covering everything known about that account:

| Tab | Contents |
|---|---|
| **Overview** | Account ID, decision badge, role badge, fraud score, ring membership, triggered patterns and flags, total sent/received, net flow, first/last transaction dates, and a plain-English explanation of *why* the account was flagged |
| **Transactions** | Every transaction involving the account (sent and received), with direction arrows, counterparty (clickable to jump to that account's panel), amount, timestamp, and whether the transaction is part of a detected ring |
| **Ring** | Full detail of the fraud ring the account belongs to — pattern type, risk score, recommendation, total ring volume, every member account with its own score/decision, and a simple text flow diagram of how money moves through the ring |
| **Connected Accounts** | All direct 1-hop counterparties, split into "Sent money to" and "Received money from," sorted by volume, with risk highlighting for any connection that is itself flagged |
| **ML Scores** | The 4-pillar breakdown (GAT / LSTM / EIF / Rules) as individual progress bars, the weighted formula with actual values filled in, and a description of every RBI flag the account triggered |

Clicking a counterparty or ring member inside any tab navigates the panel to that account instead of closing it, so an analyst can trace a money trail several hops deep without losing context.

---

## Installation & Setup

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm

### Backend

Run from the **project root** (not inside `backend/`), since the backend uses absolute imports (`backend.engine`, `backend.data_ingestion`):

```bash
pip install fastapi "uvicorn[standard]" pandas networkx numpy scikit-learn python-multipart pyyaml rapidfuzz
python -m uvicorn backend.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### Access

Guest access is available with no login required — open `http://localhost:5173` directly.

---

## Usage Instructions

1. **Open** `http://localhost:5173` in your browser (backend must be running on port 8000).
2. **Select a CSV file** — the column mapping preview runs automatically and shows how each field was detected (exact, alias, or fuzzy match) along with your file's actual column names.
3. **Review the mapping** — if a required field couldn't be matched, fix the column name in your CSV and re-select the file.
4. **Launch Analysis** — the upload returns instantly with a job ID; a live progress bar shows each detection stage as it runs. There is no timeout, regardless of file size.
5. **Analyze & Investigate:**
   - Review **Enforcement Decisions** (BLOCK/REVIEW/APPROVE) on the KPI dashboard.
   - Inspect the **Network graph** and click any node to open the 5-tab Node Inspector.
   - Trace money trails by clicking counterparties or ring members inside the inspector.
   - Examine the **Suspicious Accounts** table for individual pillar scores and triggered flags.
6. **Download** the generated JSON forensics report.

---

## Performance Benchmarks

Tested on a standard laptop (no GPU), async job architecture removes hard timeouts entirely:

| Dataset Size | Processing Time |
|---|---|
| 1,000 transactions | ~1 second |
| 10,000 transactions | ~4–11 seconds |
| 15,000 transactions | ~12–20 seconds |
| 100,000 transactions | ~60–90 seconds |
| 1,000,000+ transactions | several minutes — no longer fails, runs to completion in background |

> PageRank is automatically replaced with degree centrality on graphs with more than 8,000 nodes to avoid runaway computation time on dense graphs.

---

## Accuracy Benchmarks

Measured against the **IBM AMLSim** dataset (15,000 transactions, 1,719 labeled fraud transactions, 1,639 ground-truth fraud accounts out of 8,259 total accounts):

| Metric | Result |
|---|---|
| **Precision** | 53.1% |
| **Recall** | 48.6% |
| **F1 Score** | 50.7% |
| **Fraud rings detected** | 266 (cycle: 106, smurfing: 152, shell: 8) |
| **Flagged accounts** | 1,498 (BLOCK: 111, REVIEW: 1,387) |

These numbers come from running the actual engine end-to-end against labeled ground truth, not estimated. As an unsupervised graph engine with zero training labels, this sits well above typical first-pass AML screening precision (most production systems start in the 10–25% precision range before tuning).

To reproduce this benchmark yourself, run the verification script in `backend/validate_precision.py` against any labeled dataset with a `sender_id`, `receiver_id`, and `is_fraud` column.

---

## Known Limitations

1. **No persistence** — results are computed per-job in memory and not stored in a database; restarting the backend clears all job history.
2. **Single-file upload** — does not support multi-file batch processing in one request.
3. **Graph rendering performance** — vis.js may lag with 1,000+ nodes rendered simultaneously; consider server-side node filtering for very large graphs.
4. **GAT/LSTM are proxy implementations** — true Graph Attention Networks and LSTM temporal models are approximated via PageRank/degree centrality and inter-transaction timing variance respectively, not actual trained neural networks.
5. **No device/IP signal** — there is no device fingerprinting or IP data in CSV uploads, so detection relies entirely on transaction graph structure and timing.
6. **No authentication layer currently active** — the app currently runs in guest-access mode with no login gate.

---

## Changelog

**Async architecture & timeout removal**
- Replaced synchronous request/response with a submit-job → poll-status pattern; large files no longer fail with `timeout of 120000ms exceeded`.

**Performance fixes**
- Removed multiple `O(N²)` `iterrows()` loops across cycle, structuring, and account-type filtering logic in favor of vectorized pandas/groupby operations.
- Added a size guard so PageRank automatically falls back to degree centrality above 8,000 graph nodes.

**Detection accuracy improvements**
- Added `detect_fan_out()` and `detect_bipartite()` as new pattern detectors (previously only cycles, shells, smurfing, and structuring were covered).
- Reworked the RBI rule engine to use adaptive, percentile-based thresholds scaled to each dataset's own statistics instead of fixed absolute values.
- Fixed an F10 rule that only worked on one specific account-naming convention; generalized it to a counterparty-diversity signal that works on any ID format.
- Added F9 (new account, high transaction count) to complement F8 (new account, high transaction value).
- Fixed a ring-risk-inheritance bug where individual account scores were fully decoupled from their fraud ring's risk score, causing 90%+ risk rings to show every member as APPROVE.

**Column mapping**
- Added a dedicated `data_ingestion.py` fuzzy-matching layer with exact, normalized, alias, and fuzzy-similarity matching tiers.
- Added a `/api/preview_mapping` endpoint and frontend preview UI so column mismatches are caught before a full analysis run, with the file's actual columns surfaced in any error message.

**UI / UX**
- Added the 5-tab Node Inspector panel (Overview, Transactions, Ring, Connected Accounts, ML Scores) accessible by clicking any account or graph node.
- Fixed dashboard counters (HIGH RISK MULES, MANDATORY BLOCK, MANUAL REVIEW) that were reading the wrong score thresholds and showing 0 despite real fraud rings being detected.

---

## Team Members

Manas Prashant,
Akshay N Bhat,
Amogh Basavaraj,
Chandra Prasad R

---

## License

MIT
