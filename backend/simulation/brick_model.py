from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .brick_agent import BrickAgent
from .builder_agent import BuilderAgent, list_continuity_modes, list_failure_policies
from .placement_rules import list_placement_rules
from .shapes import Vector3, get_shape, list_shapes
from .world_state import WorldState

EXPORTS_DIR = Path(__file__).resolve().parent.parent / "exports"
DEFAULT_EXPORT_STEM = "sample"
DEFAULT_SCAD_PATH = EXPORTS_DIR / f"{DEFAULT_EXPORT_STEM}.scad"
DEFAULT_JSON_PATH = EXPORTS_DIR / f"{DEFAULT_EXPORT_STEM}.json"
DEFAULT_TOTAL_STEPS = 200


@dataclass(frozen=True)
class BuilderConfig:
    id: str
    color: str = "Red"
    shape_id: str = "bar_2x1"
    start_anchor: Vector3 = (0, 0, 0)
    placement_rule_id: str = "alternating_sideways_vertical"
    max_placements: int = DEFAULT_TOTAL_STEPS
    failure_policy: str = "backtrack"
    continuity_mode: str = "strict"
    max_backtrack_depth: Optional[int] = None

    def to_dict(self):
        return {
            "id": self.id,
            "color": self.color,
            "shapeId": self.shape_id,
            "startAnchor": list(self.start_anchor),
            "placementRuleId": self.placement_rule_id,
            "maxPlacements": self.max_placements,
            "failurePolicy": self.failure_policy,
            "continuityMode": self.continuity_mode,
            "maxBacktrackDepth": self.max_backtrack_depth,
        }


class BrickModel:
    def __init__(
        self,
        total_steps,
        brick_unit=10,
        cube_cage=200,
        builders=None,
        rng=None,
        verbose=False,
    ):
        self.brick_unit = brick_unit
        self.total_steps = total_steps
        self.cube_cage = cube_cage
        self.verbose = verbose
        self.rng = rng or random.Random()
        self.world = WorldState(brick_unit=brick_unit, cube_cage=cube_cage)
        self.bricks: list[BrickAgent] = []
        self.next_brick_id = 0
        self.trace = []
        self.builder_agents = [
            BuilderAgent(
                config=config,
                shape=get_shape(config.shape_id),
                brick_unit=self.brick_unit,
                rng=self.rng,
                verbose=self.verbose,
            )
            for config in self._normalize_builders(builders)
        ]

    def log(self, message):
        if self.verbose:
            print(message)

    def run(self):
        for tick in range(self.total_steps):
            self.log(f"Tick {tick}")
            placements_this_tick = 0
            active_builders = 0
            for builder_agent in self.builder_agents:
                if builder_agent.status == "active":
                    active_builders += 1
                if self._run_builder_step(builder_agent, tick):
                    placements_this_tick += 1
            if active_builders == 0 and placements_this_tick == 0:
                self.log("No active builders remain; ending run early.")
                break
        return self

    def _run_builder_step(self, builder_agent: BuilderAgent, tick: int):
        result = builder_agent.step(self.world, tick)
        if builder_agent.trace:
            latest_event = builder_agent.trace[-1]
            self.trace.append(latest_event.to_dict())
            self.log(latest_event.message)

        if not result.placed:
            return False

        for brick_x, brick_y, brick_z in result.cells:
            self.bricks.append(
                BrickAgent(
                    unique_id=self.next_brick_id,
                    brick_unit=self.brick_unit,
                    brick_x=brick_x,
                    brick_y=brick_y,
                    brick_z=brick_z,
                    color=builder_agent.config.color,
                    builder_id=builder_agent.config.id,
                    shape_id=builder_agent.config.shape_id,
                    placement_id=result.placement_id,
                    tick=tick,
                )
            )
            self.next_brick_id += 1
        return True

    def _normalize_builders(self, builders):
        normalized = builders or default_builder_configs(self.brick_unit)
        builder_configs: list[BuilderConfig] = []
        seen_ids: set[str] = set()

        for builder in normalized:
            if isinstance(builder, BuilderConfig):
                config = builder
            else:
                config = BuilderConfig(
                    id=builder["id"],
                    color=builder.get("color", "Red"),
                    shape_id=builder.get("shape_id", builder.get("shapeId", "bar_2x1")),
                    start_anchor=tuple(
                        builder.get("start_anchor", builder.get("startAnchor", (0, 0, 0)))
                    ),
                    placement_rule_id=builder.get(
                        "placement_rule_id",
                        builder.get(
                            "placementRuleId", "alternating_sideways_vertical"
                        ),
                    ),
                    max_placements=builder.get(
                        "max_placements",
                        builder.get("maxPlacements", self.total_steps),
                    ),
                    failure_policy=builder.get(
                        "failure_policy",
                        builder.get("failurePolicy", "backtrack"),
                    ),
                    continuity_mode=builder.get(
                        "continuity_mode",
                        builder.get("continuityMode", "strict"),
                    ),
                    max_backtrack_depth=builder.get(
                        "max_backtrack_depth",
                        builder.get("maxBacktrackDepth"),
                    ),
                )

            if config.id in seen_ids:
                raise ValueError(f"Duplicate builder id '{config.id}'.")

            get_shape(config.shape_id)
            if len(config.start_anchor) != 3:
                raise ValueError(
                    f"Builder '{config.id}' must define a 3-value start_anchor."
                )
            if config.max_placements < 0:
                raise ValueError(
                    f"Builder '{config.id}' must define a non-negative max_placements."
                )
            if config.failure_policy not in {
                "stop",
                "skip",
                "backtrack",
                "fallback_random",
            }:
                raise ValueError(
                    f"Builder '{config.id}' has unknown failure_policy "
                    f"'{config.failure_policy}'."
                )
            if config.continuity_mode != "strict":
                raise ValueError(
                    f"Builder '{config.id}' has unknown continuity_mode "
                    f"'{config.continuity_mode}'."
                )
            if config.max_backtrack_depth is not None and config.max_backtrack_depth < 1:
                raise ValueError(
                    f"Builder '{config.id}' must define max_backtrack_depth >= 1."
                )

            builder_configs.append(config)
            seen_ids.add(config.id)

        if not builder_configs:
            raise ValueError("At least one builder config is required.")

        return builder_configs

    def get_bricks(self):
        return sorted(self.bricks, key=lambda agent: agent.unique_id)

    def get_builders(self):
        return [builder_agent.config.to_dict() for builder_agent in self.builder_agents]

    def get_builder_states(self):
        return [builder_agent.to_runtime_dict() for builder_agent in self.builder_agents]

    def to_dict(self):
        return {
            "metadata": {
                "totalSteps": self.total_steps,
                "brickUnit": self.brick_unit,
                "cubeCage": self.cube_cage,
                "brickCount": len(self.bricks),
                "builderCount": len(self.builder_agents),
                "placementCount": sum(
                    builder_agent.placement_count for builder_agent in self.builder_agents
                ),
            },
            "builders": self.get_builders(),
            "builderStates": self.get_builder_states(),
            "bricks": [agent.to_dict() for agent in self.get_bricks()],
            "trace": self.trace,
            "catalog": {
                "shapes": list_shapes(),
                "placementRules": list_placement_rules(),
                "failurePolicies": list_failure_policies(),
                "continuityModes": list_continuity_modes(),
            },
        }


def default_builder_configs(brick_unit=10):
    return [
        BuilderConfig(
            id="red",
            color="Red",
            shape_id="bar_2x1",
            start_anchor=(0, 0, 0),
            placement_rule_id="alternating_sideways_vertical",
            max_placements=DEFAULT_TOTAL_STEPS,
            failure_policy="backtrack",
            continuity_mode="strict",
        ),
        BuilderConfig(
            id="blue",
            color="Blue",
            shape_id="bar_2x1",
            start_anchor=(brick_unit * 4, 0, 0),
            placement_rule_id="alternating_sideways_vertical",
            max_placements=DEFAULT_TOTAL_STEPS,
            failure_policy="backtrack",
            continuity_mode="strict",
        ),
    ]


def ensure_exports_dir():
    EXPORTS_DIR.mkdir(parents=True, exist_ok=True)


def normalize_export_stem(file_name=None):
    if not file_name:
        return DEFAULT_EXPORT_STEM
    return Path(file_name).stem or DEFAULT_EXPORT_STEM


def write_json(simulation, output_path):
    Path(output_path).write_text(json.dumps(simulation, indent=2), encoding="utf-8")


def run_simulation(
    total_steps=DEFAULT_TOTAL_STEPS,
    cube_cage=200,
    scad_output_path=DEFAULT_SCAD_PATH,
    json_output_path=DEFAULT_JSON_PATH,
    seed=None,
    builders=None,
    verbose=False,
):
    from .scad_export import build_scad, write_scad

    ensure_exports_dir()
    rng = random.Random(seed)
    model = BrickModel(
        total_steps,
        cube_cage=cube_cage,
        builders=builders,
        rng=rng,
        verbose=verbose,
    )
    model.run()

    simulation = model.to_dict()
    scad_source = str(build_scad(model.get_bricks()))
    simulation["scad"] = scad_source
    simulation["metadata"]["seed"] = seed
    simulation["metadata"]["outputPath"] = (
        str(scad_output_path) if scad_output_path else None
    )
    simulation["metadata"]["jsonOutputPath"] = (
        str(json_output_path) if json_output_path else None
    )

    if scad_output_path:
        write_scad(model.get_bricks(), scad_output_path)

    if json_output_path:
        write_json(simulation, json_output_path)

    return simulation


if __name__ == "__main__":
    run_simulation(verbose=True)
