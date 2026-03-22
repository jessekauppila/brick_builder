from __future__ import annotations

import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from .brick_agent import BrickAgent
from .placement_rules import build_candidates, list_placement_rules
from .scad_export import build_scad, write_scad
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

    def to_dict(self):
        return {
            "id": self.id,
            "color": self.color,
            "shapeId": self.shape_id,
            "startAnchor": list(self.start_anchor),
            "placementRuleId": self.placement_rule_id,
        }


@dataclass
class BuilderState:
    config: BuilderConfig
    placement_count: int = 0
    last_anchor: Optional[Vector3] = None
    last_orientation: Optional[str] = None


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
        self.builder_states = [
            BuilderState(config=config)
            for config in self._normalize_builders(builders)
        ]

    def log(self, message):
        if self.verbose:
            print(message)

    def run(self):
        for tick in range(self.total_steps):
            self.log(f"Tick {tick}")
            for builder_state in self.builder_states:
                self._run_builder_step(builder_state, tick)
        return self

    def _run_builder_step(self, builder_state: BuilderState, tick: int):
        config = builder_state.config
        shape = get_shape(config.shape_id)
        candidates = build_candidates(
            placement_rule_id=config.placement_rule_id,
            previous_anchor=builder_state.last_anchor,
            previous_orientation=builder_state.last_orientation,
            start_anchor=config.start_anchor,
            rng=self.rng,
            brick_unit=self.brick_unit,
            local_step=builder_state.placement_count,
        )

        placement_mode = "fallback"
        chosen_anchor = None
        chosen_orientation = None

        for candidate in candidates:
            if self.world.can_place(shape, candidate.anchor, candidate.orientation):
                chosen_anchor = candidate.anchor
                chosen_orientation = candidate.orientation
                placement_mode = candidate.mode
                break

        if chosen_anchor is None or chosen_orientation is None:
            self.log(
                f"Builder {config.id} could not place via {config.placement_rule_id}; "
                "picking a random free placement."
            )
            chosen_anchor, chosen_orientation = self.world.random_free_placement(
                shape, self.rng
            )

        occupied_cells = self.world.occupy(shape, chosen_anchor, chosen_orientation)
        placement_id = f"{config.id}-{builder_state.placement_count}"
        for brick_x, brick_y, brick_z in occupied_cells:
            self.bricks.append(
                BrickAgent(
                    unique_id=self.next_brick_id,
                    brick_unit=self.brick_unit,
                    brick_x=brick_x,
                    brick_y=brick_y,
                    brick_z=brick_z,
                    color=config.color,
                    builder_id=config.id,
                    shape_id=config.shape_id,
                    placement_id=placement_id,
                    tick=tick,
                )
            )
            self.next_brick_id += 1

        builder_state.last_anchor = chosen_anchor
        builder_state.last_orientation = chosen_orientation
        builder_state.placement_count += 1
        self.log(
            f"Builder {config.id} placed {config.shape_id} at {chosen_anchor} "
            f"using {placement_mode} ({chosen_orientation})."
        )

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
                )

            if config.id in seen_ids:
                raise ValueError(f"Duplicate builder id '{config.id}'.")

            get_shape(config.shape_id)
            if len(config.start_anchor) != 3:
                raise ValueError(
                    f"Builder '{config.id}' must define a 3-value start_anchor."
                )

            builder_configs.append(config)
            seen_ids.add(config.id)

        if not builder_configs:
            raise ValueError("At least one builder config is required.")

        return builder_configs

    def get_bricks(self):
        return sorted(self.bricks, key=lambda agent: agent.unique_id)

    def get_builders(self):
        return [builder_state.config.to_dict() for builder_state in self.builder_states]

    def to_dict(self):
        return {
            "metadata": {
                "totalSteps": self.total_steps,
                "brickUnit": self.brick_unit,
                "cubeCage": self.cube_cage,
                "brickCount": len(self.bricks),
                "builderCount": len(self.builder_states),
                "placementCount": sum(
                    builder_state.placement_count for builder_state in self.builder_states
                ),
            },
            "builders": self.get_builders(),
            "bricks": [agent.to_dict() for agent in self.get_bricks()],
            "catalog": {
                "shapes": list_shapes(),
                "placementRules": list_placement_rules(),
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
        ),
        BuilderConfig(
            id="blue",
            color="Blue",
            shape_id="bar_2x1",
            start_anchor=(brick_unit * 4, 0, 0),
            placement_rule_id="alternating_sideways_vertical",
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
    scad_output_path=DEFAULT_SCAD_PATH,
    json_output_path=DEFAULT_JSON_PATH,
    seed=None,
    builders=None,
    verbose=False,
):
    ensure_exports_dir()
    rng = random.Random(seed)
    model = BrickModel(total_steps, builders=builders, rng=rng, verbose=verbose)
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
