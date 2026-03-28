import mimetypes
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

try:
    from .simulation.builder_agent import list_continuity_modes, list_failure_policies
    from .simulation.competition_profiles import (
        list_archetypes,
        list_scoring_categories,
        list_strategy_shifts,
        list_symmetry_modes,
    )
    from .simulation.brick_model import (
        EXPORTS_DIR,
        default_builder_configs,
        normalize_export_stem,
        run_simulation,
    )
    from .simulation.placement_rules import list_placement_rules
    from .simulation.balance_harness import run_matchup_series, summarize_matchup_series
    from .simulation.shapes import list_shapes
except ImportError:
    from simulation.builder_agent import list_continuity_modes, list_failure_policies
    from simulation.competition_profiles import (
        list_archetypes,
        list_scoring_categories,
        list_strategy_shifts,
        list_symmetry_modes,
    )
    from simulation.brick_model import (
        EXPORTS_DIR,
        default_builder_configs,
        normalize_export_stem,
        run_simulation,
    )
    from simulation.placement_rules import list_placement_rules
    from simulation.balance_harness import run_matchup_series, summarize_matchup_series
    from simulation.shapes import list_shapes

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
    class BuildabilityProfileRequest(BaseModel):
        maxCantilever: Optional[int] = Field(default=None, ge=0, le=20)
        maxUnsupportedHeight: Optional[int] = Field(default=None, ge=0, le=20)
        requireSupportPath: Optional[bool] = None
        allowPillarDrop: Optional[bool] = None
        requireHostContact: Optional[bool] = None

    class BuilderRequest(BaseModel):
        id: str = Field(min_length=1, max_length=50)
        color: str = Field(default="Red", min_length=1, max_length=50)
        shapeId: str = "bar_2x1"
        startAnchor: tuple[int, int, int] = (0, 0, 0)
        placementRuleId: str = "competitive_growth"
        maxPlacements: int = Field(default=200, ge=0, le=2000)
        failurePolicy: str = "backtrack"
        continuityMode: str = "strict"
        maxBacktrackDepth: Optional[int] = Field(default=None, ge=1, le=5000)
        archetype: str = "territorial"
        objectiveWeights: dict[str, float] = Field(default_factory=dict)
        allowedStrategyShifts: list[str] = Field(default_factory=list)
        initialStrategy: Optional[str] = None
        buildabilityProfile: BuildabilityProfileRequest = Field(
            default_factory=BuildabilityProfileRequest
        )
        symmetryMode: str = "none"
        selectionMode: str = "legacy"

    totalSteps: int = Field(default=200, ge=1, le=2000)
    cubeCage: int = Field(default=200, ge=10, le=5000)
    seed: Optional[int] = None
    saveScad: bool = True
    saveJson: bool = True
    fileName: str = "sample.scad"
    builders: Optional[list[BuilderRequest]] = None


class BalanceRequest(BaseModel):
    seeds: list[int] = Field(default_factory=lambda: [1, 2, 3])
    totalSteps: int = Field(default=120, ge=1, le=2000)
    cubeCage: int = Field(default=160, ge=10, le=5000)
    builders: Optional[list[GenerateRequest.BuilderRequest]] = None


def builder_request_to_sim_payload(
    builder: GenerateRequest.BuilderRequest,
) -> dict[str, object]:
    return {
        "id": builder.id,
        "color": builder.color,
        "shapeId": builder.shapeId,
        "startAnchor": builder.startAnchor,
        "placementRuleId": builder.placementRuleId,
        "maxPlacements": builder.maxPlacements,
        "failurePolicy": builder.failurePolicy,
        "continuityMode": builder.continuityMode,
        "maxBacktrackDepth": builder.maxBacktrackDepth,
        "archetype": builder.archetype,
        "objectiveWeights": builder.objectiveWeights,
        "allowedStrategyShifts": builder.allowedStrategyShifts,
        "initialStrategy": builder.initialStrategy,
        "buildabilityProfile": builder.buildabilityProfile.model_dump(exclude_none=True),
        "symmetryMode": builder.symmetryMode,
        "selectionMode": builder.selectionMode,
    }


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


@app.get("/catalog")
def get_catalog():
    return {
        "shapes": list_shapes(),
        "placementRules": list_placement_rules(),
        "failurePolicies": list_failure_policies(),
        "continuityModes": list_continuity_modes(),
        "archetypes": list_archetypes(),
        "strategyShifts": list_strategy_shifts(),
        "symmetryModes": list_symmetry_modes(),
        "scoringCategories": list_scoring_categories(),
        "defaultBuilders": [builder.to_dict() for builder in default_builder_configs()],
    }


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
        cube_cage=payload.cubeCage,
        scad_output_path=scad_output_path,
        json_output_path=json_output_path,
        seed=payload.seed,
        builders=[
            builder_request_to_sim_payload(builder) for builder in payload.builders
        ]
        if payload.builders is not None
        else None,
        verbose=False,
    )
    scad_file_name = scad_output_path.name if scad_output_path else None
    json_file_name = json_output_path.name if json_output_path else None
    simulation["downloadUrl"] = build_download_url(request, scad_file_name)
    simulation["jsonDownloadUrl"] = build_download_url(request, json_file_name)
    return simulation


@app.post("/balance")
def run_balance(payload: BalanceRequest):
    builders_payload = (
        [builder_request_to_sim_payload(b) for b in payload.builders]
        if payload.builders is not None
        else [builder.to_dict() for builder in default_builder_configs()]
    )
    results = run_matchup_series(
        builder_configs=builders_payload,
        seeds=payload.seeds,
        total_steps=payload.totalSteps,
        cube_cage=payload.cubeCage,
    )
    return summarize_matchup_series(results)


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
