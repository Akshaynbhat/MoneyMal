"""
Hybrid Sentinel — FastAPI Backend
Async Job Architecture: Upload returns job_id immediately.
Engine runs in a background thread pool (full accuracy, no shortcuts).
Poll /api/result/{job_id} for the result.
"""

import io
import json
import os
import uuid
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from backend.engine import ForensicsEngine
from backend.data_ingestion import build_column_mapping

# ---- In-memory job store ------------------------------------------------- #
# Stores job results keyed by job_id. Lightweight for a local app.
_jobs: dict[str, dict] = {}

# Keep reference to the last run engine and renamed DataFrame for detailed node inspections
_last_engine: Optional[ForensicsEngine] = None
_last_df: Optional[pd.DataFrame] = None

# Thread pool: engine runs here so FastAPI event loop never blocks
_executor = ThreadPoolExecutor(max_workers=2)


def _run_engine(job_id: str, df: pd.DataFrame) -> None:
    """Runs the full forensics engine in a background thread. No accuracy shortcuts."""
    global _last_engine, _last_df
    try:
        _jobs[job_id]["status"] = "running"
        engine = ForensicsEngine()
        engine.load_data(df)
        result = engine.run_all()
        graph_data = engine.get_graph_data()
        _jobs[job_id] = {
            "status": "done",
            "result": json.loads(json.dumps(result, default=str)),
            "graph":  json.loads(json.dumps(graph_data, default=str)),
        }
        # Save session variables (use engine.df since load_data renames/converts columns)
        _last_engine = engine
        _last_df = engine.df
    except Exception as e:
        _jobs[job_id] = {"status": "error", "detail": str(e)}


# ---- FastAPI App ---------------------------------------------------------- #
app = FastAPI(
    title="Hybrid Sentinel API",
    description="Money Muling Detection Engine — Async Job Architecture",
    version="6.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "engine": "Hybrid Sentinel v6 (Async)"}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Accept CSV upload and immediately return a job_id.
    The engine runs in a background thread — no timeout possible.
    Poll /api/result/{job_id} for progress and results.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    job_id = str(uuid.uuid4())
    _jobs[job_id] = {"status": "queued"}

    # Submit to thread pool — returns immediately, no blocking
    loop = asyncio.get_event_loop()
    loop.run_in_executor(_executor, _run_engine, job_id, df)

    return JSONResponse(content={"job_id": job_id, "status": "queued"})


@app.get("/api/result/{job_id}")
async def get_result(job_id: str):
    """
    Poll this endpoint after submitting an analysis job.
    Returns: status = 'queued' | 'running' | 'done' | 'error'
    When status == 'done', result and graph are included.
    """
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    return JSONResponse(content=job)


@app.get("/api/jobs")
async def list_jobs():
    """List all current job IDs and their statuses."""
    return {"jobs": {jid: j.get("status") for jid, j in _jobs.items()}}


@app.get("/api/account/{account_id}")
async def get_account(account_id: str):
    global _last_engine, _last_df
    if _last_engine is None or _last_df is None:
        raise HTTPException(status_code=400, detail="No active analysis session found. Please run the analysis first.")

    # Check if node exists in Graph
    if not _last_engine.G.has_node(account_id):
        raise HTTPException(status_code=404, detail=f"Account {account_id} not found in the analyzed dataset.")

    # 1. Fetch node risk metrics
    suspicion_score = _last_engine.suspicion_scores.get(account_id, 0.0)
    decision = _last_engine.enforcement_verdicts.get(account_id, "APPROVE")
    role = _last_engine.node_roles.get(account_id, "LEAF")
    patterns = list(_last_engine.account_patterns.get(account_id, set()))

    # Map patterns to flag_hits (F1-F10, AT_BREACH)
    pattern_map = {
        'F1_FAST_PASSTHROUGH': 'F1',
        'F2_DORMANT_BURST': 'F2',
        'F3_MICRO_SMURFING': 'F3',
        'F4_MACRO_VOLUME_OUTLIER': 'F4',
        'F5_RAPID_OUTBOUND': 'F5',
        'F6_COORDINATED_GROUP': 'F6',
        'F7_OUTLIER_TXN': 'F7',
        'F8_NEW_ACC_HIGH_VAL': 'F8',
        'F9_NEW_ACC_HIGH_VELOCITY': 'F9',
        'F10_RAPID_LAYERING': 'F10',
        'threshold_breach': 'AT_BREACH',
        'AT_BREACH': 'AT_BREACH'
    }
    flag_hits = sorted(list(set(pattern_map[pat] for pat in patterns if pat in pattern_map)))

    # Fetch 4-pillar scores and normalize them to 100
    four_pillar = _last_engine.four_pillar_scores.get(account_id, {})
    ml_scores = {
        "GAT": round(min(100.0, (four_pillar.get('GAT', 0.0) / 35.0) * 100), 1),
        "LSTM": round(min(100.0, (four_pillar.get('LSTM', 0.0) / 25.0) * 100), 1),
        "EIF": round(min(100.0, (four_pillar.get('EIF', 0.0) / 20.0) * 100), 1),
        "Rules": round(min(100.0, (four_pillar.get('Rules', 0.0) / 25.0) * 100), 1),
    }

    # 2. Get list of transactions involving the account
    # We must sort by timestamp descending (newest first)
    acc_txs = _last_df[(_last_df['sender_id'] == account_id) | (_last_df['receiver_id'] == account_id)].copy()
    acc_txs = acc_txs.sort_values('timestamp', ascending=False)

    # Find the ring_id if the account is in a ring
    ring_id = "NONE"
    ring_members = []
    for ring in _last_engine.fraud_rings:
        if account_id in ring["member_accounts"]:
            ring_id = ring["ring_id"]
            ring_members = ring["member_accounts"]
            break

    # Build transactions list
    transactions = []
    for _, row in acc_txs.iterrows():
        tx_sender = str(row['sender_id'])
        tx_receiver = str(row['receiver_id'])
        is_ring_tx = False
        if ring_id != "NONE":
            is_ring_tx = (tx_sender in ring_members) and (tx_receiver in ring_members)

        transactions.append({
            "transaction_id": str(row['transaction_id']),
            "direction": "sent" if tx_sender == account_id else "received",
            "counterparty": tx_receiver if tx_sender == account_id else tx_sender,
            "amount": float(row['amount']),
            "timestamp": str(row['timestamp']),
            "is_ring_transaction": is_ring_tx
        })

    # 3. Get ring details
    ring_details = None
    if ring_id != "NONE":
        # Find the matching ring object
        for r in _last_engine.fraud_rings:
            if r["ring_id"] == ring_id:
                # Calculate total amount and tx count for ring
                ring_txs = _last_df[_last_df["sender_id"].isin(ring_members) & _last_df["receiver_id"].isin(ring_members)]
                total_amount = float(ring_txs["amount"].sum())
                tx_count = int(len(ring_txs))
                
                members_list = []
                for m in ring_members:
                    members_list.append({
                        "account_id": m,
                        "role": _last_engine.node_roles.get(m, "LEAF"),
                        "score": _last_engine.suspicion_scores.get(m, 0.0),
                        "decision": _last_engine.enforcement_verdicts.get(m, "APPROVE"),
                        "patterns": list(_last_engine.account_patterns.get(m, set()))
                    })

                ring_details = {
                    "ring_id": ring_id,
                    "pattern_type": r["pattern_type"],
                    "risk_score": r["risk_score"],
                    "recommendation": "BLOCK" if r["risk_score"] >= 75 else "REVIEW",
                    "total_amount": total_amount,
                    "tx_count": tx_count,
                    "members": members_list
                }
                break

    # 4. Connections (direct neighbors)
    # sent_to
    sent_to = []
    for succ in _last_engine.G.successors(account_id):
        # find all edges
        edges = []
        if _last_engine.G.has_edge(account_id, succ):
            for _, d in _last_engine.G[account_id][succ].items():
                edges.append(d)
        
        sent_to.append({
            "account_id": succ,
            "total_amount": float(sum(e["amount"] for e in edges)),
            "tx_count": int(len(edges)),
            "score": _last_engine.suspicion_scores.get(succ, 0.0),
            "decision": _last_engine.enforcement_verdicts.get(succ, "APPROVE")
        })
    sent_to.sort(key=lambda x: -x["total_amount"])

    # received_from
    received_from = []
    for pred in _last_engine.G.predecessors(account_id):
        edges = []
        if _last_engine.G.has_edge(pred, account_id):
            for _, d in _last_engine.G[pred][account_id].items():
                edges.append(d)
        
        received_from.append({
            "account_id": pred,
            "total_amount": float(sum(e["amount"] for e in edges)),
            "tx_count": int(len(edges)),
            "score": _last_engine.suspicion_scores.get(pred, 0.0),
            "decision": _last_engine.enforcement_verdicts.get(pred, "APPROVE")
        })
    received_from.sort(key=lambda x: -x["total_amount"])

    connections = {
        "sent_to": sent_to,
        "received_from": received_from
    }

    return JSONResponse(content={
        "account_id": account_id,
        "suspicion_score": suspicion_score,
        "decision": decision,
        "role": role,
        "ring_id": ring_id,
        "patterns": patterns,
        "flag_hits": flag_hits,
        "ml_scores": ml_scores,
        "transactions": transactions,
        "ring_details": ring_details,
        "connections": connections
    })


@app.get("/api/transactions")
async def get_all_transactions(
    page: int = 1,
    limit: int = 100,
    search: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_dir: str = "desc"
):
    global _last_df, _last_engine
    if _last_df is None or _last_engine is None:
        raise HTTPException(status_code=400, detail="No active analysis session found. Please run the analysis first.")
    
    df = _last_df.copy()
    
    for col in ['sender_id', 'receiver_id', 'transaction_id']:
        if col in df.columns:
            df[col] = df[col].astype(str)
            
    if search:
        q = search.strip().lower()
        df = df[
            df['sender_id'].str.lower().str.contains(q) |
            df['receiver_id'].str.lower().str.contains(q) |
            df['transaction_id'].str.lower().str.contains(q)
        ]
        
    if sort_by in df.columns:
        df = df.sort_values(sort_by, ascending=(sort_dir == "asc"))
    else:
        df = df.sort_values("timestamp", ascending=False)
        
    total_records = len(df)
    
    start = (page - 1) * limit
    end = start + limit
    df_page = df.iloc[start:end]
    
    transactions = []
    for _, row in df_page.iterrows():
        tx_sender = str(row['sender_id'])
        tx_receiver = str(row['receiver_id'])
        
        is_ring_tx = False
        sender_ring = None
        receiver_ring = None
        for ring in _last_engine.fraud_rings:
            if tx_sender in ring["member_accounts"] and tx_receiver in ring["member_accounts"]:
                is_ring_tx = True
            if tx_sender in ring["member_accounts"]:
                sender_ring = ring["ring_id"]
            if tx_receiver in ring["member_accounts"]:
                receiver_ring = ring["ring_id"]
                
        transactions.append({
            "transaction_id": str(row['transaction_id']),
            "sender_id": tx_sender,
            "sender_score": _last_engine.suspicion_scores.get(tx_sender, 0.0),
            "sender_role": _last_engine.node_roles.get(tx_sender, "LEAF"),
            "sender_ring": sender_ring,
            "receiver_id": tx_receiver,
            "receiver_score": _last_engine.suspicion_scores.get(tx_receiver, 0.0),
            "receiver_role": _last_engine.node_roles.get(tx_receiver, "LEAF"),
            "receiver_ring": receiver_ring,
            "amount": float(row['amount']),
            "timestamp": str(row['timestamp']),
            "is_ring_transaction": is_ring_tx,
            "sender_patterns": list(_last_engine.account_patterns.get(tx_sender, set())),
            "receiver_patterns": list(_last_engine.account_patterns.get(tx_receiver, set())),
        })
        
    return JSONResponse(content={
        "transactions": transactions,
        "total": total_records,
        "page": page,
        "limit": limit
    })





@app.post("/api/preview_mapping")
async def preview_mapping(file: UploadFile = File(...)):
    """
    Returns column mapping preview WITHOUT running full analysis.
    Called when the user selects a file, before they click 'Analyze'.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files accepted.")
    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    mapping_result = build_column_mapping(df)
    return JSONResponse(content=mapping_result)


# ---- Serve frontend static build ------------------------------------------ #
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("backend.main:app", host="0.0.0.0", port=port, reload=False)
