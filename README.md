# 🛡️ MoneyMal — A Financial Forensics Engine

> Graph-based money muling detection engine / Financial Crime Detection 

![Python](https://img.shields.io/badge/Python-3.10+-blue?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-green?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![NetworkX](https://img.shields.io/badge/NetworkX-Graph_Theory-orange)
![Machine Learning](https://img.shields.io/badge/Machine%20Learning-GAT_|_LSTM_|_EIF-F7931E)

🔗 **Deployment link** 
https://money-mal-nxch.vercel.app/
---

## 📋 Table of Contents

- [Overview](#overview)
- [Tech Stack](#tech-stack)
- [System Architecture](#system-architecture)
- [Algorithm Approach & RBI Rules](#algorithm-approach--rbi-rules)
- [4-Pillar Scoring & Decisions](#4-pillar-scoring--decisions)
- [Structural Roles](#structural-roles)
- [Installation & Setup](#installation--setup)
- [Usage Instructions](#usage-instructions)
- [Known Limitations](#known-limitations)
- [Team Members](#team-members)

---

## Overview

MoneyMal is an advanced web-based financial forensics engine that processes transaction CSV data and exposes money muling networks through graph analysis and interactive visualization. It integrates a **modern 4-Pillar Machine Learning Pipeline (GAT, LSTM, EIF, Rules)** alongside **10 strict RBI/NPCI-compliant fraud detection rules** to identify circular fund routing, smurfing patterns, and layered shell networks. 

It actively assigns structural hierarchy roles (HUB, BRIDGE, MULE, LEAF) to exposed network entities and generates concrete enforcement decisions (BLOCK / REVIEW / APPROVE).

### Key Features

- **Secure Authentication Layer:** Analysts log in to access full forensic context securely.
- **Upload CSV** → instant graph analysis with sub-second processing.
- **Interactive network graph** with color-coded risk tiers and structural roles.
- **Multi-Pillar ML Scoring:** Replaced legacy models with a 4-pillar architecture (Graph Attention Networks, LSTMs, Extended Isolation Forests, and Rule heuristics).
- **Enforcement Decisions:** Automated BLOCK, REVIEW, or APPROVE verdicts per account.
- **Downloadable JSON report** in exact hackathon-spec format.
- **Fraud ring summary table** detailing risk scores and hierarchy.
- **Dark "Threat Matrix" UI** with glassmorphism and micro-animations.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 7, vis-network (vis.js), Tailwind CSS 4 |
| **Backend** | Python 3.10+, FastAPI, Uvicorn |
| **Authentication** | OAuth2 with JWT hashing |
| **Graph Engine** | NetworkX (MultiDiGraph) |
| **ML & AI** | Deep Learning (GAT, LSTM), scikit-learn (EIF) |
| **Numerical** | NumPy, Pandas |

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND (React + Vite)              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────┐  │
│  │ Login.jsx│  │NetworkGraph  │  │FraudTable│  │Forensic│  │
│  │ Dashboard│  │ Interactive  │  │ Ring     │  │ Card   │  │
│  │ Upload   │  │ Graph        │  │ Summary  │  │ Detail │  │
│  └────┬─────┘  └──────────────┘  └──────────┘  └────────┘  │
│       │  POST /api/analyze (Auth JWT Token Required)        │
├───────┼─────────────────────────────────────────────────────┤
│       ▼           BACKEND (FastAPI - Auth Guarded)          │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              ForensicsEngine (OOP)                    │   │
│  │                                                      │   │
│  │  1. load_data() ──── MultiDiGraph construction       │   │
│  │  2. run_rbi_rules() ─ 10 NPCI/RBI Heuristics         │   │
│  │  3. Graph/Cycle/Smurfing Detection                   │   │
│  │  4. calculate_multi_pillar_scores()                   │   │
│  │     ├── Pillar 1: RBI Base Rules                     │   │
│  │     ├── Pillar 2: GAT (Graph Attention Network)      │   │
│  │     ├── Pillar 3: LSTM (Temporal Sequencing)         │   │
│  │     └── Pillar 4: EIF (Extended Isolation Forest)    │   │
│  │  5. assign_roles() ── HUB, BRIDGE, MULE, LEAF        │   │
│  │  6. determine_decisions() ─ BLOCK/REVIEW/APPROVE     │   │
│  │  7. generate_json() + get_graph_data()               │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Algorithm Approach & RBI Rules

The engine implements 10 new RBI/NPCI-compliant directives targeting specific transaction anomalies:
1. Smurfing Threshold Triggers
2. High-Velocity Pass-Throughs
3. Dormant Account Re-activation Spikes
4. Circular Flow Constraints
5. Geographic/IP Isolation (mocked via ID proximity)
6. Structuring below reporting limits
7. Night-Time Anomaly Activity 
8. Unrelated Entity Fan-outs
9. Retention Ratio Flags
10. Newly Created Account Volumes

These rules act as base determiners for the multi-pillar machine learning evaluation.

---

## 4-Pillar Scoring & Decisions

The scoring mechanism calculates risk from four distinct angles, synthesizing them into a final **Enforcement Decision**.

1. **Rules Engine:** Hard logic checks per RBI/NPCI compliance.
2. **EIF (Extended Isolation Forest):** Identifies outlier behavioral volumes and frequency without relying on strict graph connections.
3. **GAT (Graph Attention Networks):** Neural networks observing multi-hop connections, scoring nodes based on their neighbor's threat profile.
4. **LSTM:** Temporal neural checks treating transaction history as a time-series to detect sudden, structured spikes indicative of muling.

### Enforcement Matrix

| Combined Score | Verdict | Action |
|---|---|---|
| **0 - 35** | **APPROVE** | Cleared for normal operations. |
| **36 - 65** | **REVIEW** | Flagged for manual analyst verification. |
| **66 - 100** | **BLOCK** | Immediate system blackout and asset freeze. |

---

## Structural Roles

Instead of treating all nodes equally, the engine categorizes entities by their function in the illicit pipeline:

- **HUB:** Central aggregator storing vast amounts of illicit funds. Often large accounts.
- **BRIDGE:** The intermediary. Shuttles money across regions or distinct network clusters.
- **MULE:** Standard disperser. Handles rapid, low-retention transactions.
- **LEAF:** Edge nodes. Often the victims or endpoint cash-out systems.

---

## Installation & Setup

### Prerequisites

- **Python 3.10+**
- **Node.js 18+** and npm

### Backend

```bash
cd backend
pip install -r requirements.txt
python start.py  # or uvicorn main:app --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Usage Instructions

1. **Open** `http://localhost:5173` (or `8000` via launcher) in your browser.
2. **Log In** using proper analyst credentials configured in the secure auth layer.
3. **Upload** a CSV file with columns: `transaction_id`, `sender_id`, `receiver_id`, `amount`, `timestamp`
4. **Analyze & Investigate:**
   - Review **Enforcement Decisions** (BLOCK/REVIEW/APPROVE) directly on the KPI dashboard.
   - Inspect the **Network graph** to trace relationships across HUD, BRIDGE, MULE, and LEAF nodes.
   - Examine the **Suspicious Accounts** table to see individual scores split across the 4 ML Pillars.
5. **Download** the generated JSON forensics report matching hacking specs.

---

## Known Limitations

1. **No persistence** — results are computed per-request and not stored in a database.
2. **Single-file upload** — does not support multi-file batch processing.
3. **Graph rendering performance** — vis.js may lag with 1000+ nodes. For massive datasets, consider server-side filtering.
4. **Mocked Deep Learning** — Note: In the hackathon context, GAT/LSTM implementations might operate on scaled approximations depending on system constraints.

---

## Team Members

Bhuvan Bapat,
Manas Prashant,
Akshay N Bhat,
Amogh Basavaraj

---

## License

MIT
