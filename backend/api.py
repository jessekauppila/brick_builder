from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from Brick_Builder_1 import DEFAULT_SCAD_PATH, run_simulation

EXPORTS_DIR = DEFAULT_SCAD_PATH.parent

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
    seed: int | None = None
    saveScad: bool = True
    fileName: str = "sample.scad"


def resolve_output_path(file_name: str) -> Path:
    safe_name = Path(file_name).name or DEFAULT_SCAD_PATH.name
    if not safe_name.endswith(".scad"):
        safe_name = f"{safe_name}.scad"
    return EXPORTS_DIR / safe_name


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/generate")
def generate_model(payload: GenerateRequest):
    output_path = resolve_output_path(payload.fileName) if payload.saveScad else None
    simulation = run_simulation(
        total_steps=payload.totalSteps,
        output_path=output_path,
        seed=payload.seed,
        verbose=False,
    )
    file_name = output_path.name if output_path else None
    simulation["downloadUrl"] = (
        f"http://127.0.0.1:8000/exports/{file_name}" if file_name else None
    )
    return simulation


@app.get("/exports/{file_name}")
def download_export(file_name: str):
    output_path = resolve_output_path(file_name)
    if not output_path.exists():
        raise HTTPException(status_code=404, detail="Export not found.")
    return FileResponse(output_path, media_type="text/plain", filename=output_path.name)
