"""
Hybrid Sentinel — FastAPI Backend
Stateless REST API serving the merged forensics engine.
Serves the React frontend static build in production.
"""

import io
import json
import os

import pandas as pd
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles

from engine import ForensicsEngine

app = FastAPI(
    title="Hybrid Sentinel API",
    description="Money Muling Detection Engine — RIFT 2026",
    version="5.0.0",
)

# ---- CORS (allow all origins for universal deployment) ---- #
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "engine": "Hybrid Sentinel v5"}


@app.post("/api/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Accept a CSV file upload, run the full forensic analysis,
    and return the result JSON + graph data.
    """
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are accepted.")

    try:
        content = await file.read()
        df = pd.read_csv(io.BytesIO(content))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse CSV: {e}")

    engine = ForensicsEngine()
    try:
        engine.load_data(df)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    result = engine.run_all()
    graph_data = engine.get_graph_data()

    return JSONResponse(content={
        "result": json.loads(json.dumps(result, default=str)),
        "graph": json.loads(json.dumps(graph_data, default=str)),
    })


# ---- Serve frontend static build ---- #
FRONTEND_DIST = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")

if os.path.isdir(FRONTEND_DIST):
    # Mount static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=os.path.join(FRONTEND_DIST, "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        """Catch-all: serve index.html for SPA routing."""
        file_path = os.path.join(FRONTEND_DIST, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
