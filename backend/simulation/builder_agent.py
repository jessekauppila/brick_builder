from __future__ import annotations

from dataclasses import dataclass, field
from random import Random
from typing import Optional

from .competition_profiles import get_archetype_profile
from .placement_rules import PlacementCandidate, build_candidates
from .shapes import BrickShape, Vector3, absolute_cells
from .world_state import WorldState

FAILURE_POLICY_LABELS = {
    "stop": "Stop Builder",
    "skip": "Skip Tick",
    "backtrack": "Backtrack Through History",
    "fallback_random": "Fallback To Random Placement",
}
CONTINUITY_MODE_LABELS = {
    "strict": "Strict Continuity",
}


@dataclass(frozen=True)
class PlacementRecord:
    placement_id: str
    tick: int
    anchor: Vector3
    orientation: str
    cells: list[Vector3]
    strategy: str
    reference_cell: Vector3


@dataclass(frozen=True)
class BuilderTraceEvent:
    tick: int
    builder_id: str
    action: str
    message: str
    placement_id: Optional[str] = None
    strategy: Optional[str] = None
    reference_cell: Optional[Vector3] = None
    status: Optional[str] = None

    def to_dict(self):
        return {
            "tick": self.tick,
            "builderId": self.builder_id,
            "action": self.action,
            "message": self.message,
            "placementId": self.placement_id,
            "strategy": self.strategy,
            "referenceCell": list(self.reference_cell) if self.reference_cell else None,
            "status": self.status,
        }


@dataclass(frozen=True)
class BuilderStepResult:
    placed: bool
    cells: list[Vector3] = field(default_factory=list)
    placement_id: Optional[str] = None
    strategy: Optional[str] = None
    reference_cell: Optional[Vector3] = None
    action: str = "idle"
    message: str = ""


class BuilderAgent:
    def __init__(
        self,
        config,
        shape: BrickShape,
        brick_unit: int,
        rng: Random,
        verbose: bool = False,
    ):
        self.config = config
        self.shape = shape
        self.brick_unit = brick_unit
        self.rng = rng
        self.verbose = verbose
        self.placement_count = 0
        self.last_anchor: Optional[Vector3] = None
        self.last_orientation: Optional[str] = None
        self.status = "active"
        self.blocked_reason: Optional[str] = None
        self.last_action = "idle"
        self.placement_history: list[PlacementRecord] = []
        self.cell_history: list[Vector3] = []
        self.trace: list[BuilderTraceEvent] = []

    def _use_competitive_selection(self) -> bool:
        """Stop 03: scored selection is enabled only for fortress archetypes."""
        mode = getattr(self.config, "selection_mode", "legacy")
        if mode != "competitive":
            return False
        return self.config.archetype == "fortress"

    def _merged_objective_weights(self) -> dict[str, float]:
        try:
            profile = get_archetype_profile(self.config.archetype)
            merged = dict(profile.default_objective_weights)
        except ValueError:
            merged = {}
        merged.update(dict(self.config.objective_weights))
        return merged

    def _competitive_candidate_score(
        self, world_state: WorldState, candidate: PlacementCandidate
    ) -> float:
        cells = absolute_cells(
            self.shape, candidate.anchor, candidate.orientation, self.brick_unit
        )
        min_z = min(z for _, _, z in cells)
        max_xy = max(abs(x) + abs(y) for x, y, z in cells) / self.brick_unit
        touches_ground = min_z <= 0
        chain_metric = 0.0
        if self.last_anchor is not None:
            ax, ay, az = candidate.anchor
            lx, ly, lz = self.last_anchor
            chain_metric = (
                abs(ax - lx) + abs(ay - ly) + abs(az - lz)
            ) / self.brick_unit
        weights = self._merged_objective_weights()
        raw_metrics = {
            "territory": max_xy,
            "surface": float(len(cells)),
            "enclosure": float(-min_z) / self.brick_unit,
            "chain": chain_metric,
            "support": 2.0 if touches_ground else 0.25,
            "choke": 0.0,
            "symmetry": 0.0,
        }
        return sum(weights.get(key, 0.0) * value for key, value in raw_metrics.items())

    def _select_candidate(
        self,
        world_state: WorldState,
        candidates: list[PlacementCandidate],
        strategy_prefix: str,
        reference_cell: Optional[Vector3] = None,
    ):
        if self._use_competitive_selection():
            best_candidate = None
            best_score = None
            best_tie = None
            for candidate in candidates:
                if not world_state.can_place(
                    self.shape, candidate.anchor, candidate.orientation
                ):
                    continue
                score = self._competitive_candidate_score(world_state, candidate)
                tie = (candidate.anchor, candidate.orientation, candidate.mode)
                if (
                    best_candidate is None
                    or score > best_score
                    or (score == best_score and best_tie is not None and tie < best_tie)
                ):
                    best_candidate = candidate
                    best_score = score
                    best_tie = tie
            if best_candidate is None:
                return None
            return (
                best_candidate,
                f"{strategy_prefix}_{best_candidate.mode}",
                reference_cell or best_candidate.anchor,
            )

        for candidate in candidates:
            if world_state.can_place(self.shape, candidate.anchor, candidate.orientation):
                return (
                    candidate,
                    f"{strategy_prefix}_{candidate.mode}",
                    reference_cell or candidate.anchor,
                )
        return None

    def step(self, world_state: WorldState, tick: int) -> BuilderStepResult:
        if self.status != "active":
            return self._emit(
                tick,
                action="inactive",
                message=f"Builder {self.config.id} is {self.status}.",
                status=self.status,
            )

        if self.placement_count >= self.config.max_placements:
            self.status = "completed"
            self.blocked_reason = None
            return self._emit(
                tick,
                action="completed",
                message=(
                    f"Builder {self.config.id} reached max placements "
                    f"({self.config.max_placements})."
                ),
                status=self.status,
            )

        direct_candidates = build_candidates(
            placement_rule_id=self.config.placement_rule_id,
            previous_anchor=self.last_anchor,
            previous_orientation=self.last_orientation,
            start_anchor=self.config.start_anchor,
            rng=self.rng,
            brick_unit=self.brick_unit,
            local_step=self.placement_count,
        )
        direct_match = self._select_candidate(
            world_state, direct_candidates, strategy_prefix="direct"
        )
        if direct_match:
            return self._commit_placement(
                world_state,
                tick,
                candidate=direct_match[0],
                strategy=direct_match[1],
                reference_cell=direct_match[2],
            )

        if self.config.failure_policy == "backtrack":
            backtrack_match = self._find_backtrack_candidate(world_state)
            if backtrack_match:
                return self._commit_placement(
                    world_state,
                    tick,
                    candidate=backtrack_match[0],
                    strategy=backtrack_match[1],
                    reference_cell=backtrack_match[2],
                )
            return self._block(
                tick,
                reason=(
                    f"Builder {self.config.id} could not place contiguously after "
                    "backtracking through prior cells."
                ),
            )

        if self.config.failure_policy == "skip":
            return self._emit(
                tick,
                action="skipped",
                message=(
                    f"Builder {self.config.id} could not place contiguously and "
                    "skipped this tick."
                ),
                status=self.status,
            )

        if self.config.failure_policy == "fallback_random":
            anchor, orientation = world_state.random_free_placement(self.shape, self.rng)
            candidate = PlacementCandidate(anchor=anchor, orientation=orientation, mode="random")
            return self._commit_placement(
                world_state,
                tick,
                candidate=candidate,
                strategy="fallback_random",
                reference_cell=anchor,
            )

        return self._block(
            tick,
            reason=(
                f"Builder {self.config.id} could not place contiguously and stopped."
            ),
        )

    def to_runtime_dict(self):
        return {
            "id": self.config.id,
            "status": self.status,
            "placementCount": self.placement_count,
            "maxPlacements": self.config.max_placements,
            "failurePolicy": self.config.failure_policy,
            "continuityMode": self.config.continuity_mode,
            "maxBacktrackDepth": self.config.max_backtrack_depth,
            "lastAnchor": list(self.last_anchor) if self.last_anchor else None,
            "lastOrientation": self.last_orientation,
            "lastAction": self.last_action,
            "blockedReason": self.blocked_reason,
        }

    def _find_backtrack_candidate(self, world_state: WorldState):
        search_cells = list(reversed(self.cell_history))
        if self.config.max_backtrack_depth is not None:
            search_cells = search_cells[: self.config.max_backtrack_depth]

        for reference_cell in search_cells:
            candidates = build_candidates(
                placement_rule_id=self.config.placement_rule_id,
                previous_anchor=reference_cell,
                previous_orientation=self.last_orientation,
                start_anchor=self.config.start_anchor,
                rng=self.rng,
                brick_unit=self.brick_unit,
                local_step=self.placement_count,
            )
            match = self._select_candidate(
                world_state,
                candidates,
                strategy_prefix="backtrack",
                reference_cell=reference_cell,
            )
            if match:
                return match
        return None

    def _commit_placement(
        self,
        world_state: WorldState,
        tick: int,
        candidate: PlacementCandidate,
        strategy: str,
        reference_cell: Vector3,
    ) -> BuilderStepResult:
        occupied_cells = world_state.occupy(
            self.shape, candidate.anchor, candidate.orientation
        )
        placement_id = f"{self.config.id}-{self.placement_count}"
        self.placement_history.append(
            PlacementRecord(
                placement_id=placement_id,
                tick=tick,
                anchor=candidate.anchor,
                orientation=candidate.orientation,
                cells=occupied_cells,
                strategy=strategy,
                reference_cell=reference_cell,
            )
        )
        self.cell_history.extend(occupied_cells)
        self.last_anchor = candidate.anchor
        self.last_orientation = candidate.orientation
        self.placement_count += 1
        self.last_action = "placed"
        self.blocked_reason = None
        return self._emit(
            tick,
            action="placed",
            message=(
                f"Builder {self.config.id} placed {self.shape.id} at "
                f"{candidate.anchor} via {strategy}."
            ),
            placement_id=placement_id,
            strategy=strategy,
            reference_cell=reference_cell,
            status=self.status,
            placed=True,
            cells=occupied_cells,
        )

    def _block(self, tick: int, reason: str) -> BuilderStepResult:
        self.status = "blocked"
        self.blocked_reason = reason
        self.last_action = "blocked"
        return self._emit(
            tick,
            action="blocked",
            message=reason,
            status=self.status,
        )

    def _emit(
        self,
        tick: int,
        action: str,
        message: str,
        placement_id: Optional[str] = None,
        strategy: Optional[str] = None,
        reference_cell: Optional[Vector3] = None,
        status: Optional[str] = None,
        placed: bool = False,
        cells: Optional[list[Vector3]] = None,
    ) -> BuilderStepResult:
        if action != "placed":
            self.last_action = action
        event = BuilderTraceEvent(
            tick=tick,
            builder_id=self.config.id,
            action=action,
            message=message,
            placement_id=placement_id,
            strategy=strategy,
            reference_cell=reference_cell,
            status=status or self.status,
        )
        self.trace.append(event)
        if self.verbose:
            print(message)
        return BuilderStepResult(
            placed=placed,
            cells=cells or [],
            placement_id=placement_id,
            strategy=strategy,
            reference_cell=reference_cell,
            action=action,
            message=message,
        )


def list_failure_policies() -> list[dict[str, str]]:
    return [
        {"id": policy_id, "label": label}
        for policy_id, label in sorted(FAILURE_POLICY_LABELS.items())
    ]


def list_continuity_modes() -> list[dict[str, str]]:
    return [
        {"id": mode_id, "label": label}
        for mode_id, label in sorted(CONTINUITY_MODE_LABELS.items())
    ]
