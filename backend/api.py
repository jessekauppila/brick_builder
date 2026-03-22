import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from .simulation.brick_model import EXPORTS_DIR, normalize_export_stem, run_simulation
except ImportError:
    from simulation.brick_model import EXPORTS_DIR, normalize_export_stem, run_simulation

DEFAULT_EXPORT_STEM = "sample"

app = FastAPI(title="Brick Builder API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class GenerateRequest(BaseModel):
    totalSteps: int = Field(default=200, ge=1, le=2000)
    seed: Optional[int] = None
    saveScad: bool = True
    saveJson: bool = True
    fileName: str = "sample.scad"


def resolve_output_path(file_name: str, extension: str) -> Path:
    export_stem = normalize_export_stem(file_name or DEFAULT_EXPORT_STEM)
    return EXPORTS_DIR / f"{export_stem}{extension}"


def build_download_url(request: Request, file_name: Optional[str]):
    if not file_name:
        return None
    return str(request.base_url.replace(path=f"exports/{file_name}"))


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/generate")
def generate_model(payload: GenerateRequest, request: Request):
    scad_output_path = (
        resolve_output_path(payload.fileName, ".scad") if payload.saveScad else None
    )
    json_output_path = (
        resolve_output_path(payload.fileName, ".json") if payload.saveJson else None
    )
    simulation = run_simulation(
        total_steps=payload.totalSteps,
        scad_output_path=scad_output_path,
        json_output_path=json_output_path,
        seed=payload.seed,
        verbose=False,
    )
    scad_file_name = scad_output_path.name if scad_output_path else None
    json_file_name = json_output_path.name if json_output_path else None
    simulation["downloadUrl"] = build_download_url(request, scad_file_name)
    simulation["jsonDownloadUrl"] = build_download_url(request, json_file_name)
    return simulation


@app.get("/exports/{file_name}")
def download_export(file_name: str):
    output_path = EXPORTS_DIR / Path(file_name).name
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Export not found.")
    media_type, _ = mimetypes.guess_type(output_path.name)
    return FileResponse(
        output_path,
        media_type=media_type or "application/octet-stream",
        filename=output_path.name,
    )
