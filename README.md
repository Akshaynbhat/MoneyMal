# 🛡️ MoneyMal — Financial Forensics Engine

> Graph-based money muling detection engine / Financial Crime Detection 

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![NetworkX](https://img.shields.io/badge/NetworkX-Graph_Theory-orange)
![scikit-learn](https://img.shields.io/badge/scikit--learn-ML-F7931E?logo=scikitlearn&logoColor=white)

🔗 **Deployment link** 
https://money-mal-nxch.vercel.app/
---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Algorithm Approach](#algorithm-approach)
- [Suspicion Score Methodology](#suspicion-score-methodology)
- [Installation & Setup](#installation--setup)
- [Usage Instructions](#usage-instructions)
- [Known Limitations](#known-limitations)
- [Team Members](#team-members)

---

## Overview

MoneyMal is a web-based financial forensics engine that processes transaction CSV data and exposes money muling networks through graph analysis and interactive visualization. It combines **multi-constraint graph algorithms** with **machine learning anomaly detection** to identify circular fund routing, smurfing patterns, and layered shell networks — while actively suppressing false positives from merchants and payroll accounts.

### Key Features

- **Upload CSV** → instant graph analysis with sub-second processing
- **Fuzzy Column Mapping** → loose and normalized header matching with immediate validation warnings
- **Interactive Network Graph** with color-coded risk tiers (vis.js)
- **Deep Node Inspector** → 5-tab side panel detailing Overview, Transactions logs, Ring details with flow diagrams, Connected accounts, and ML scores
- **Downloadable JSON Report** in exact hackathon-spec format
- **Fraud Ring Summary Table** with risk scores
- **Dark "Threat Matrix" UI** with glassmorphism and micro-animations

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, vis-network (vis.js), Tailwind CSS 4 |
| **Backend** | Python 3.10+, FastAPI, Uvicorn |
| **Graph Engine** | NetworkX (MultiDiGraph) |
| **ML** | scikit-learn (Isolation Forest) |
| **Numerical** | NumPy, Pandas |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────┐  │
│  │ App.jsx  │  │NetworkGraph  │  │FraudTable│  │Forensic│  │
│  │ Upload   │  │ (vis.js)     │  │          │  │ Card   │  │
│  │ KPI Cards│  │ Interactive  │  │ Ring     │  │ Detail │  │
│  │ Download │  │ Graph        │  │ Summary  │  │ View   │  │
│  └────┬─────┘  └──────────────┘  └──────────┘  └────────┘  │
│       │  POST /api/analyze (CSV upload)                     │
├───────┼─────────────────────────────────────────────────────┤
│       ▼           BACKEND (FastAPI)                         │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ForensicsEngine (OOP)                    │   │
│  │                                                      │   │
│  │  1. load_data() ──── MultiDiGraph construction       │   │
│  │  2. detect_cycles() ─ DFS + 4-layer validation       │   │
│  │  3. detect_smurfing() CV + retention + holding time  │   │
│  │  4. detect_shells() ── passthrough + lifetime check  │   │
│  │  5. detect_velocity() numpy vectorized (< 1h)        │   │
│  │  6. calculate_suspicion_scores()                      │   │
│  │     ├── IsolationForest ML (anomaly bonus ≤ 15)      │   │
│  │     ├── Merchant penalty (-20)                        │   │
│  │     ├── Suppression penalty (-50)                     │   │
│  │     └── Isolation cluster bonus (+8)                  │   │
│  │  7. generate_json() + get_graph_data()               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Algorithm Approach

### 1. Cycle Detection (Circular Fund Routing)

**Algorithm:** Bounded DFS (depth 3–5) on degree-filtered adjacency + 4-layer constraint validation + Union-Find ring merging.

**Steps:**
1. Filter eligible nodes: `2 ≤ total_degree ≤ 20`
2. DFS from each eligible node with per-node operation budget (5,000 ops)
3. On cycle discovery, validate with 4 constraints:
   - **Temporal window:** All edges within 72 hours
   - **Amount variance:** Each amount within ±15% of cycle mean
   - **Flow conservation:** `min(amounts)/max(amounts) ≥ 0.70`
   - **External isolation:** Each node has ≤ 5 non-cycle connections during window
4. Canonicalize via minimal rotation (dedup)
5. Merge overlapping cycles via **Union-Find** with size cap (30 nodes)

**Complexity:** `O(V · B · L)` where `V` = eligible nodes, `B` = ops budget (5000), `L` = max depth (5). Global cap: 2000 cycles.

### 2. Smurfing Detection (Fan-In / Fan-Out)

**Algorithm:** Sliding window scan per node with multi-constraint validation.

**Fan-In Detection** (many → one → many):
1. Scan inbound transactions with 72h sliding window
2. Require ≥ 10 inbound transactions in window
3. **Amount CV ≤ 0.40** — transactions must be similarly-sized (structuring signal)
4. **≥ 5 outbound transactions within 48h** — must actually disperse
5. **Retention ratio ≤ 0.50** — at most 50% of funds kept
6. **Holding time ≤ 30 hours** — quick turnaround confirms mule behavior

**Fan-Out Detection** (one funding source → disperses to many):
1. Scan outbound transactions with 72h sliding window
2. Require ≥ 10 outbound transactions
3. **Amount CV ≤ 0.40**
4. **≤ 2 unique inbound sources** — single funding pipeline
5. **Holding time ≤ 30 hours**

**Complexity:** `O(V · T)` where `T` = max transactions per node.

### 3. Shell Network Detection (Layered Intermediaries)

**Algorithm:** Candidate identification → chain walking.

**Candidate Filtering:**
1. Degree 2–3 (low transaction count)
2. **Passthrough ratio ≥ 80%**: ≥ 80% of incoming funds forwarded within 24h
3. **Short lifetime**: Active for ≤ 30% of dataset time span
4. **Distinct predecessor/successor**: At least one pred→node→succ path with pred ≠ succ

**Chain Walking:**
- BFS/DFS from non-candidate nodes through candidate chains
- Chains capped at length 7
- Require ≥ 2 verified shell intermediaries

**Complexity:** `O(V · E)` for candidate filtering, `O(V · C^L)` for chain walking where `C` = avg candidate degree, `L` = max chain length.

### 4. Velocity Detection

**Algorithm:** Vectorized numpy scan for in→out pairs within 1 hour per account.

**Complexity:** `O(T log T)` dominated by sort.

---

## Suspicion Score Methodology

Scores range from **0 to 100**. Higher = more suspicious.

### Base Pattern Weights

| Pattern | Points |
|---|---|
| `cycle_length_3` | +25 |
| `cycle_length_4` | +20 |
| `cycle_length_5` | +15 |
| `smurfing_aggregator` / `smurfing_disperser` | +22 |
| `shell_network` | +18 |
| `high_velocity` (if structural pattern exists) | +10 |

Base pattern score capped at 70.

### ML Anomaly Component (IsolationForest)

- **Features:** in_degree, out_degree, total_volume_in, total_volume_out
- **Output:** Anomaly score normalized to 0–15 points
- Accounts with unusual degree/volume profiles relative to the population receive higher anomaly scores

### False Positive Suppression

| Mechanism | Effect | Criteria |
|---|---|---|
| **Merchant Penalty** | -20 pts | Repeat-ratio ≥ 30%, timing CV < 1.5, ≥ 10 transactions |
| **Suppression Penalty** | -50 pts | Degree > 50, activity span > 70% of dataset, amount CV > 0.5, no large gaps |

### Score Boosters

| Mechanism | Effect | Criteria |
|---|---|---|
| **Isolation Cluster** | +8 pts | ≥ 2 neighbors with score > 30 |

### Final Processing

- Scores clamped to `[0, 100]`
- Accounts with no patterns and score < 15 are zeroed out
- Output sorted descending by `suspicion_score`

---

## Installation & Setup

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm

### Backend

```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Usage Instructions

1. **Open** `http://localhost:5173` in your browser.
2. **Select or Upload** a CSV file. The engine will automatically run a pre-upload **Fuzzy Column Mapping Preview** to detect columns even if they are named differently (e.g., `Source_Account`, `Transfer_Amount`).
3. If any required columns are missing, a warning will block analysis until a valid CSV is uploaded.
4. **Click** `▶ LAUNCH ANALYSIS` once the green ready check is shown.
5. **View results:**
   - **KPI cards** show total accounts, flagged accounts, rings detected, and processing time.
   - **Network graph** shows all accounts and transactions with color-coded risk tiers.
   - **Fraud Ring Summary** table lists all detected rings with risk scores.
   - **Suspicious Accounts** table shows flagged accounts (clicking one redirects to the graph and inspects the node).
6. **Inspect Nodes**: Click any node in the graph, member in the ring list, or counterparty in the transaction logs to open the **Node Inspector Panel** showing:
   - **Overview**: Dynamic risk brief and key statistics.
   - **Transactions**: All incoming/outgoing transfers with interactive counterparty links.
   - **Ring**: Ring flow diagrams and other group members.
   - **Connected**: List of all 1-hop neighbors and risk metrics.
   - **ML Scores**: Weighted formula equation display and triggered compliance flags.
7. **Download** the JSON report with the `⬇ DOWNLOAD FORENSIC REPORT` button.

### Test Data

```bash
# Generate a 15K+ transaction synthetic AML dataset
python generate_aml_dataset.py

# Generate a 5K transaction stress test
python generate_stress_test.py
```

---

## Known Limitations

1. **No persistence** — results are computed per-request and not stored in a database
2. **Single-file upload** — does not support multi-file batch processing
3. **Cycle length cap at 5** — cycles of length 6+ are not detected (per spec)
4. **Static thresholds** — smurfing CV (0.40), retention (0.50), holding time (30h) are hardcoded rather than adaptive
5. **No incremental analysis** — each upload re-analyzes the entire dataset from scratch
6. **Graph rendering performance** — vis.js may lag with 1000+ nodes; for very large datasets, consider server-side filtering
7. **Timezone-naive** — timestamps are processed without timezone awareness

---

## Team Members

Bhuvan Bapat,
Manas Prashant,
Akshay N Bhat,
Amogh Basavaraj

---

## License

MIT

---


