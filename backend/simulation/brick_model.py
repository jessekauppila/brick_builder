from __future__ import annotations

import json
import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from .brick_agent import BrickAgent
from .builder_agent import BuilderAgent, list_continuity_modes, list_failure_policies
from .competition_profiles import (
    default_buildability_profile,
    default_objective_weights,
    get_archetype_profile,
    list_archetypes,
    list_scoring_categories,
    list_strategy_shifts,
    list_symmetry_modes,
)
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
    placement_rule_id: str = "competitive_growth"
    max_placements: int = DEFAULT_TOTAL_STEPS
    failure_policy: str = "backtrack"
    continuity_mode: str = "strict"
    max_backtrack_depth: Optional[int] = None
    archetype: str = "territorial"
    objective_weights: dict[str, float] = field(default_factory=dict)
    allowed_strategy_shifts: tuple[str, ...] = ()
    initial_strategy: str = ""
    buildability_profile: dict[str, int | bool] = field(default_factory=dict)
    symmetry_mode: str = "none"
    selection_mode: str = "legacy"
    shift_pillar_threshold: int = 2
    shift_reinforce_threshold: int = 8
    shift_wrap_threshold: int = 2

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
            "archetype": self.archetype,
            "objectiveWeights": self.objective_weights,
            "allowedStrategyShifts": list(self.allowed_strategy_shifts),
            "initialStrategy": self.initial_strategy,
            "buildabilityProfile": self.buildability_profile,
            "symmetryMode": self.symmetry_mode,
            "selectionMode": self.selection_mode,
            "shiftPillarThreshold": self.shift_pillar_threshold,
            "shiftReinforceThreshold": self.shift_reinforce_threshold,
            "shiftWrapThreshold": self.shift_wrap_threshold,
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
        self.timeline: list[dict[str, object]] = []
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
            self.timeline.append(self._build_tick_snapshot(tick))
            if active_builders == 0 and placements_this_tick == 0:
                self.log("No active builders remain; ending run early.")
                break
        return self

    def _run_builder_step(self, builder_agent: BuilderAgent, tick: int):
        prior_event_count = len(builder_agent.trace)
        result = builder_agent.step(self.world, tick)
        if len(builder_agent.trace) > prior_event_count:
            new_events = builder_agent.trace[prior_event_count:]
            for event in new_events:
                self.trace.append(event.to_dict())
                self.log(event.message)

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
                    supported=result.supported,
                    strategy=result.strategy,
                    score=result.score_total,
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
                            "placementRuleId", "competitive_growth"
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
                    archetype=builder.get("archetype", "territorial"),
                    objective_weights=dict(
                        builder.get("objective_weights", builder.get("objectiveWeights", {}))
                    ),
                    allowed_strategy_shifts=tuple(
                        builder.get(
                            "allowed_strategy_shifts",
                            builder.get("allowedStrategyShifts", ()),
                        )
                    ),
                    initial_strategy=builder.get(
                        "initial_strategy",
                        builder.get("initialStrategy", ""),
                    ),
                    buildability_profile=dict(
                        builder.get(
                            "buildability_profile",
                            builder.get("buildabilityProfile", {}),
                        )
                    ),
                    symmetry_mode=builder.get(
                        "symmetry_mode",
                        builder.get("symmetryMode", "none"),
                    ),
                    selection_mode=builder.get(
                        "selection_mode",
                        builder.get("selectionMode", "legacy"),
                    ),
                    shift_pillar_threshold=builder.get(
                        "shift_pillar_threshold",
                        builder.get("shiftPillarThreshold", 2),
                    ),
                    shift_reinforce_threshold=builder.get(
                        "shift_reinforce_threshold",
                        builder.get("shiftReinforceThreshold", 8),
                    ),
                    shift_wrap_threshold=builder.get(
                        "shift_wrap_threshold",
                        builder.get("shiftWrapThreshold", 2),
                    ),
                )

            if config.id in seen_ids:
                raise ValueError(f"Duplicate builder id '{config.id}'.")

            get_shape(config.shape_id)
            profile = get_archetype_profile(config.archetype)
            merged_weights = default_objective_weights(config.archetype)
            merged_weights.update(config.objective_weights)
            merged_buildability = default_buildability_profile(config.archetype)
            merged_buildability.update(config.buildability_profile)
            allowed_strategy_shifts = tuple(
                config.allowed_strategy_shifts or profile.allowed_strategy_shifts
            )
            initial_strategy = config.initial_strategy or profile.initial_strategy
            symmetry_mode = config.symmetry_mode or profile.symmetry_mode

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
            unknown_strategy_ids = set(allowed_strategy_shifts) - {
                option["id"] for option in list_strategy_shifts()
            }
            if unknown_strategy_ids:
                raise ValueError(
                    f"Builder '{config.id}' has unknown strategy shifts "
                    f"{sorted(unknown_strategy_ids)}."
                )
            if initial_strategy not in allowed_strategy_shifts:
                raise ValueError(
                    f"Builder '{config.id}' initial_strategy '{initial_strategy}' must "
                    "be present in allowed_strategy_shifts."
                )
            if symmetry_mode not in {
                option["id"] for option in list_symmetry_modes()
            }:
                raise ValueError(
                    f"Builder '{config.id}' has unknown symmetry_mode "
                    f"'{symmetry_mode}'."
                )

            builder_configs.append(
                BuilderConfig(
                    id=config.id,
                    color=config.color,
                    shape_id=config.shape_id,
                    start_anchor=config.start_anchor,
                    placement_rule_id=config.placement_rule_id,
                    max_placements=config.max_placements,
                    failure_policy=config.failure_policy,
                    continuity_mode=config.continuity_mode,
                    max_backtrack_depth=config.max_backtrack_depth,
                    archetype=config.archetype,
                    objective_weights=merged_weights,
                    allowed_strategy_shifts=allowed_strategy_shifts,
                    initial_strategy=initial_strategy,
                    buildability_profile=merged_buildability,
                    symmetry_mode=symmetry_mode,
                    selection_mode=config.selection_mode,
                    shift_pillar_threshold=config.shift_pillar_threshold,
                    shift_reinforce_threshold=config.shift_reinforce_threshold,
                    shift_wrap_threshold=config.shift_wrap_threshold,
                )
            )
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
            "timeline": self.timeline,
            "catalog": {
                "shapes": list_shapes(),
                "placementRules": list_placement_rules(),
                "failurePolicies": list_failure_policies(),
                "continuityModes": list_continuity_modes(),
                "archetypes": list_archetypes(),
                "strategyShifts": list_strategy_shifts(),
                "symmetryModes": list_symmetry_modes(),
                "scoringCategories": list_scoring_categories(),
            },
        }

    def _build_tick_snapshot(self, tick: int) -> dict[str, object]:
        events = [event for event in self.trace if event["tick"] == tick]
        active = sum(1 for b in self.builder_agents if b.status == "active")
        blocked = sum(1 for b in self.builder_agents if b.status == "blocked")
        placements = sum(1 for e in events if e.get("action") == "placed")
        return {
            "tick": tick,
            "brickCount": len(self.bricks),
            "placementCount": sum(
                builder_agent.placement_count for builder_agent in self.builder_agents
            ),
            "placementsThisTick": placements,
            "activeBuilders": active,
            "blockedBuilders": blocked,
            "scoresByBuilder": {
                b.config.id: round(b.total_score, 3)
                for b in self.builder_agents
            },
            "builders": self.get_builder_states(),
            "events": events,
        }


def default_builder_configs(brick_unit=10):
    fortress = get_archetype_profile("fortress")
    vine = get_archetype_profile("vine")
    coral = get_archetype_profile("coral")
    territorial = get_archetype_profile("territorial")
    return [
        BuilderConfig(
            id="fortress-red",
            color="#ef4444",
            shape_id="bar_2x1",
            start_anchor=(0, 0, 0),
            placement_rule_id="competitive_growth",
            max_placements=DEFAULT_TOTAL_STEPS,
            failure_policy="backtrack",
            continuity_mode="strict",
            archetype="fortress",
            objective_weights=default_objective_weights("fortress"),
            allowed_strategy_shifts=fortress.allowed_strategy_shifts,
            initial_strategy=fortress.initial_strategy,
            buildability_profile=default_buildability_profile("fortress"),
            symmetry_mode=fortress.symmetry_mode,
        ),
        BuilderConfig(
            id="vine-blue",
            color="#38bdf8",
            shape_id="bar_2x1",
            start_anchor=(brick_unit * 4, 0, 0),
            placement_rule_id="competitive_growth",
            max_placements=DEFAULT_TOTAL_STEPS,
            failure_policy="backtrack",
            continuity_mode="strict",
            archetype="vine",
            objective_weights=default_objective_weights("vine"),
            allowed_strategy_shifts=vine.allowed_strategy_shifts,
            initial_strategy=vine.initial_strategy,
            buildability_profile=default_buildability_profile("vine"),
            symmetry_mode=vine.symmetry_mode,
        ),
        BuilderConfig(
            id="coral-green",
            color="#22c55e",
            shape_id="bar_3x1",
            start_anchor=(0, brick_unit * 4, 0),
            placement_rule_id="competitive_growth",
            max_placements=DEFAULT_TOTAL_STEPS,
            failure_policy="backtrack",
            continuity_mode="strict",
            archetype="coral",
            objective_weights=default_objective_weights("coral"),
            allowed_strategy_shifts=coral.allowed_strategy_shifts,
            initial_strategy=coral.initial_strategy,
            buildability_profile=default_buildability_profile("coral"),
            symmetry_mode=coral.symmetry_mode,
        ),
        BuilderConfig(
            id="territorial-gold",
            color="#f59e0b",
            shape_id="single_1x1",
            start_anchor=(brick_unit * 4, brick_unit * 4, 0),
            placement_rule_id="competitive_growth",
            max_placements=DEFAULT_TOTAL_STEPS,
            failure_policy="backtrack",
            continuity_mode="strict",
            archetype="territorial",
            objective_weights=default_objective_weights("territorial"),
            allowed_strategy_shifts=territorial.allowed_strategy_shifts,
            initial_strategy=territorial.initial_strategy,
            buildability_profile=default_buildability_profile("territorial"),
            symmetry_mode=territorial.symmetry_mode,
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
    scad_source = ""
    if scad_output_path:
        from .scad_export import build_scad, write_scad

        scad_source = str(build_scad(model.get_bricks()))
        write_scad(model.get_bricks(), scad_output_path)
    simulation["scad"] = scad_source
    simulation["metadata"]["seed"] = seed
    simulation["metadata"]["outputPath"] = (
        str(scad_output_path) if scad_output_path else None
    )
    simulation["metadata"]["jsonOutputPath"] = (
        str(json_output_path) if json_output_path else None
    )

    if json_output_path:
        write_json(simulation, json_output_path)

    return simulation


if __name__ == "__main__":
    run_simulation(verbose=True)
