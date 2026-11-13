"""
A.V.I.A. on-board inference service (internal; only the core API calls it).

    GET  /api/v1/health          models_loaded + per-artifact status
    POST /api/v1/infer           4 encoders -> fusion -> GRU -> attribution / forecast / alerts
    POST /api/v1/twin/projection skeletal heuristic bridge + cardiovascular / dermal priors
    POST /api/v1/suit/evaluate   suit swelling encoder (503 if its LBNP calibration CSV is missing)

Run locally:  uvicorn src.api.main:app --port 8000   (AVIA_MODEL_DIR defaults to ../model files)
"""
from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

import torch
from fastapi import FastAPI, HTTPException

from ..engine.fusion import FusionVariant
from ..engine.pipeline import Pipeline
from ..engine.registry import Registry
from .schemas import InferRequest, SuitRequest, TwinRequest

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO").upper(), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("avia.api")

MODEL_VERSION = "avia-fusion-gru-1.0"
DEFAULT_MODEL_DIR = Path(__file__).resolve().parents[3] / "model files"


@asynccontextmanager
async def lifespan(app: FastAPI):
    torch.set_num_threads(int(os.environ.get("TORCH_THREADS", "2")))
    reg = Registry(model_dir=Path(os.environ.get("AVIA_MODEL_DIR", DEFAULT_MODEL_DIR)))
    reg.load(FusionVariant())
    if reg.ready:
        log.info("models loaded in %s ms from %s: %s", reg.load_ms, reg.model_dir, reg.artifacts)
    else:
        log.error("models NOT loaded: %s", reg.error)
    if reg.suit_error:
        log.warning("suit model unavailable: %s", reg.suit_error)
    app.state.registry = reg
    app.state.pipeline = Pipeline(reg) if reg.ready else None
    yield


app = FastAPI(title="A.V.I.A. inference", version=MODEL_VERSION, lifespan=lifespan)


def _pipeline() -> Pipeline:
    p = app.state.pipeline
    if p is None:
        raise HTTPException(status_code=503, detail=f"Models not loaded: {app.state.registry.error}")
    return p


@app.get("/api/v1/health")
def health():
    reg: Registry = app.state.registry
    return {
        "status": "online" if reg.ready else "degraded",
        "models_loaded": reg.ready,
        "model_version": MODEL_VERSION,
        "model_scope": "existing_weights_reconstructed_fusion",
        "clinical_validation": "not_established",
        "device": str(reg.device),
        "load_ms": reg.load_ms,
        "error": reg.error or None,
        "models": {
            "cardiac_encoder": reg.cardiac is not None,
            "stress_encoder": reg.stress is not None,
            "sleep_encoder": reg.sleep is not None,
            "nasa_context_encoder": reg.context is not None,
            "temporal_fusion_engine": reg.engine is not None,
            "suit_swelling_encoder": reg.suit is not None,
        },
        "suit_unavailable_reason": reg.suit_error or None,
        "data_repairs": reg.cbc_repairs,
        "artifacts": reg.artifacts,
    }


@app.post("/api/v1/infer")
def infer(req: InferRequest):
    out = _pipeline().infer(req)
    out["model_version"] = MODEL_VERSION
    return out


@app.post("/api/v1/twin/projection")
def twin(req: TwinRequest):
    return _pipeline().twin(req)


@app.post("/api/v1/suit/evaluate")
def suit(req: SuitRequest):
    pipeline = _pipeline()
    if app.state.registry.suit is None:
        raise HTTPException(status_code=503, detail=app.state.registry.suit_error)
    payload = req.model_dump(exclude={"crew_id", "adherence_pct"})
    return {"crew_id": req.crew_id, **pipeline.suit(payload), "model_version": MODEL_VERSION}
