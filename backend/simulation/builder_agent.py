from __future__ import annotations

from dataclasses import dataclass, field
from random import Random
from typing import Optional

from .competition_profiles import default_buildability_profile, default_objective_weights, get_archetype_profile
from .placement_rules import PlacementCandidate, build_candidates
from .shapes import BrickShape, Vector3
from .world_state import PlacementAnalysis, WorldState

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
class ScoreEvent:
    category: str
    points: float
    reason: str

    def to_dict(self) -> dict[str, object]:
        return {
            "category": self.category,
            "points": round(self.points, 3),
            "reason": self.reason,
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
    score_total: float
    supported: bool


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
    score_delta: float = 0.0
    scores: tuple[ScoreEvent, ...] = ()
    running_score: float = 0.0
    strategy_before: Optional[str] = None
    strategy_after: Optional[str] = None
    support_path_exists: Optional[bool] = None
    supported: Optional[bool] = None

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
            "scoreDelta": round(self.score_delta, 3),
            "scores": [score.to_dict() for score in self.scores],
            "runningScore": round(self.running_score, 3),
            "strategyBefore": self.strategy_before,
            "strategyAfter": self.strategy_after,
            "supportPathExists": self.support_path_exists,
            "supported": self.supported,
        }


@dataclass(frozen=True)
class CandidateEvaluation:
    candidate: PlacementCandidate
    strategy: str
    reference_cell: Vector3
    analysis: PlacementAnalysis
    score_breakdown: dict[str, float]
    total_score: float
    source: str


@dataclass(frozen=True)
class BuilderStepResult:
    placed: bool
    cells: list[Vector3] = field(default_factory=list)
    placement_id: Optional[str] = None
    strategy: Optional[str] = None
    reference_cell: Optional[Vector3] = None
    action: str = "idle"
    message: str = ""
    score_total: float = 0.0
    score_events: tuple[ScoreEvent, ...] = ()
    supported: bool = False
    analysis: Optional[PlacementAnalysis] = None


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
        profile = get_archetype_profile(config.archetype)
        self.objective_weights = default_objective_weights(config.archetype)
        self.objective_weights.update(config.objective_weights)
        self.allowed_strategy_shifts = tuple(
            config.allowed_strategy_shifts or profile.allowed_strategy_shifts
        )
        self.buildability_profile = default_buildability_profile(config.archetype)
        self.buildability_profile.update(config.buildability_profile)
        self.symmetry_mode = config.symmetry_mode or profile.symmetry_mode
        self.placement_count = 0
        self.last_anchor: Optional[Vector3] = None
        self.last_orientation: Optional[str] = None
        self.last_analysis: Optional[PlacementAnalysis] = None
        self.status = "active"
        self.blocked_reason: Optional[str] = None
        self.last_action = "idle"
        self.current_strategy = config.initial_strategy or profile.initial_strategy
        self.placement_history: list[PlacementRecord] = []
        self.cell_history: list[Vector3] = []
        self.trace: list[BuilderTraceEvent] = []
        self.total_score = 0.0
        self.score_breakdown = {category: 0.0 for category in self.objective_weights}

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

        self._maybe_shift_strategy(world_state, tick)
        direct_match = self._evaluate_reference(
            world_state=world_state,
            reference_cell=self.last_anchor,
            source="direct",
        )
        if direct_match:
            return self._commit_placement(
                world_state,
                tick,
                evaluation=direct_match,
            )

        if self.config.failure_policy == "backtrack":
            backtrack_match = self._find_backtrack_candidate(world_state)
            if backtrack_match:
                return self._commit_placement(
                    world_state,
                    tick,
                    evaluation=backtrack_match,
                )
            return self._block(
                tick,
                reason=(
                    f"Builder {self.config.id} could not place after "
                    "evaluating direct and backtrack candidates."
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
                strategy=self.current_strategy,
            )

        if self.config.failure_policy == "fallback_random":
            anchor, orientation = world_state.random_free_placement(self.shape, self.rng)
            candidate = PlacementCandidate(
                anchor=anchor,
                orientation=orientation,
                mode="random",
                source="fallback",
            )
            analysis = world_state.analyze_placement(
                shape=self.shape,
                anchor=anchor,
                orientation=orientation,
                builder_id=self.config.id,
            )
            evaluation = CandidateEvaluation(
                candidate=candidate,
                strategy="fallback_random",
                reference_cell=anchor,
                analysis=analysis,
                score_breakdown=self._score_candidate(
                    world_state=world_state,
                    analysis=analysis,
                    candidate=candidate,
                    reference_cell=anchor,
                    strategy="fallback_random",
                ),
                total_score=0.0,
                source="fallback",
            )
            return self._commit_placement(world_state, tick, evaluation=evaluation)

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
            "archetype": self.config.archetype,
            "currentStrategy": self.current_strategy,
            "allowedStrategyShifts": list(self.allowed_strategy_shifts),
            "symmetryMode": self.symmetry_mode,
            "score": round(self.total_score, 3),
            "scoreBreakdown": {
                category: round(points, 3)
                for category, points in self.score_breakdown.items()
            },
            "buildabilityProfile": self.buildability_profile,
        }

    def _find_backtrack_candidate(self, world_state: WorldState):
        search_cells = list(reversed(self.cell_history))
        if self.config.max_backtrack_depth is not None:
            search_cells = search_cells[: self.config.max_backtrack_depth]

        best_match: Optional[CandidateEvaluation] = None
        for reference_cell in search_cells:
            match = self._evaluate_reference(
                world_state=world_state,
                reference_cell=reference_cell,
                source="backtrack",
            )
            if match and (best_match is None or match.total_score > best_match.total_score):
                best_match = match
        return best_match

    def _evaluate_reference(
        self,
        world_state: WorldState,
        reference_cell: Optional[Vector3],
        source: str,
    ) -> Optional[CandidateEvaluation]:
        candidates = build_candidates(
            placement_rule_id=self.config.placement_rule_id,
            previous_anchor=reference_cell,
            previous_orientation=self.last_orientation,
            start_anchor=self.config.start_anchor,
            rng=self.rng,
            brick_unit=self.brick_unit,
            local_step=self.placement_count,
            strategy_id=self.current_strategy,
        )
        evaluations = self._evaluate_candidates(
            world_state=world_state,
            candidates=candidates,
            reference_cell=reference_cell or self.config.start_anchor,
            source=source,
        )
        if not evaluations:
            return None
        best_score = max(evaluation.total_score for evaluation in evaluations)
        best_matches = [
            evaluation
            for evaluation in evaluations
            if abs(evaluation.total_score - best_score) < 1e-6
        ]
        return self.rng.choice(best_matches)

    def _evaluate_candidates(
        self,
        world_state: WorldState,
        candidates: list[PlacementCandidate],
        reference_cell: Vector3,
        source: str,
    ) -> list[CandidateEvaluation]:
        valid_evaluations: list[CandidateEvaluation] = []
        for candidate in candidates:
            analysis = world_state.analyze_placement(
                shape=self.shape,
                anchor=candidate.anchor,
                orientation=candidate.orientation,
                builder_id=self.config.id,
            )
            if not analysis.valid:
                continue
            if not self._passes_buildability(analysis):
                continue
            score_breakdown = self._score_candidate(
                world_state=world_state,
                analysis=analysis,
                candidate=candidate,
                reference_cell=reference_cell,
                strategy=self.current_strategy,
            )
            valid_evaluations.append(
                CandidateEvaluation(
                    candidate=candidate,
                    strategy=f"{source}_{self.current_strategy}_{candidate.mode}",
                    reference_cell=reference_cell,
                    analysis=analysis,
                    score_breakdown=score_breakdown,
                    total_score=sum(score_breakdown.values()),
                    source=source,
                )
            )
        return valid_evaluations

    def _passes_buildability(self, analysis: PlacementAnalysis) -> bool:
        profile = self.buildability_profile
        if profile["requireSupportPath"] and not analysis.support_path_exists:
            return False
        if analysis.cantilever > int(profile["maxCantilever"]):
            return False
        if analysis.unsupported_height > int(profile["maxUnsupportedHeight"]):
            return False
        if profile["requireHostContact"] and self.placement_count > 0:
            if analysis.enemy_neighbors + analysis.friendly_neighbors == 0:
                return False
        return True

    def _score_candidate(
        self,
        world_state: WorldState,
        analysis: PlacementAnalysis,
        candidate: PlacementCandidate,
        reference_cell: Vector3,
        strategy: str,
    ) -> dict[str, float]:
        raw_metrics = {
            "territory": float(analysis.control_cells),
            "surface": float(analysis.exposed_faces),
            "enclosure": max(
                0.0,
                float(analysis.friendly_neighbors * 1.5 - analysis.exposed_faces * 0.35),
            ),
            "chain": self._chain_metric(candidate.anchor, reference_cell, analysis),
            "support": self._support_metric(analysis),
            "choke": float(analysis.choke_points + len(analysis.enemy_contact_builders)),
            "symmetry": self._symmetry_metric(world_state, analysis),
        }
        strategy_bonus = self._strategy_bonus(analysis, strategy, candidate)
        score_breakdown: dict[str, float] = {}
        for category, weight in self.objective_weights.items():
            score_breakdown[category] = raw_metrics.get(category, 0.0) * weight
        score_breakdown["strategy"] = strategy_bonus
        return score_breakdown

    def _chain_metric(
        self,
        anchor: Vector3,
        reference_cell: Vector3,
        analysis: PlacementAnalysis,
    ) -> float:
        ax, ay, az = anchor
        rx, ry, rz = reference_cell
        reach = abs(ax - rx) + abs(ay - ry) + abs(az - rz)
        leaf_bonus = 2.0 if analysis.friendly_neighbors <= 2 else 0.0
        return float(reach // max(self.brick_unit, 1)) + leaf_bonus

    def _support_metric(self, analysis: PlacementAnalysis) -> float:
        support_score = analysis.support_contacts * 1.8
        if analysis.support_path_exists:
            support_score += 4.0
        support_score -= analysis.cantilever * 2.5
        support_score -= analysis.unsupported_height * 2.0
        return support_score

    def _symmetry_metric(
        self,
        world_state: WorldState,
        analysis: PlacementAnalysis,
    ) -> float:
        if self.symmetry_mode == "none":
            return 0.0

        existing_cells = world_state.builder_cells(self.config.id)
        before_imbalance = self._symmetry_imbalance(existing_cells)
        after_imbalance = self._symmetry_imbalance(existing_cells + analysis.cells)
        return before_imbalance - after_imbalance

    def _symmetry_imbalance(self, cells: list[Vector3]) -> float:
        start_x, start_y, _ = self.config.start_anchor
        if not cells:
            return 0.0

        if self.symmetry_mode == "mirror_x":
            positive = sum(1 for x, _, _ in cells if x >= start_x)
            negative = sum(1 for x, _, _ in cells if x < start_x)
            return abs(positive - negative)
        if self.symmetry_mode == "mirror_y":
            positive = sum(1 for _, y, _ in cells if y >= start_y)
            negative = sum(1 for _, y, _ in cells if y < start_y)
            return abs(positive - negative)

        quadrants = [0, 0, 0, 0]
        for x, y, _ in cells:
            if x >= start_x and y >= start_y:
                quadrants[0] += 1
            elif x < start_x and y >= start_y:
                quadrants[1] += 1
            elif x < start_x and y < start_y:
                quadrants[2] += 1
            else:
                quadrants[3] += 1
        return float(max(quadrants) - min(quadrants))

    def _strategy_bonus(
        self,
        analysis: PlacementAnalysis,
        strategy: str,
        candidate: PlacementCandidate,
    ) -> float:
        if strategy == "reinforce":
            return (
                analysis.support_contacts * 1.2
                + max(0, analysis.friendly_neighbors - analysis.enemy_neighbors)
            )
        if strategy == "wrap":
            return analysis.enemy_neighbors * 1.8 + analysis.choke_points * 2.0
        if strategy == "pillar":
            pillar_direction = 1.5 if candidate.anchor[2] <= (self.last_anchor or candidate.anchor)[2] else 0.0
            return analysis.support_contacts * 1.5 + pillar_direction
        return analysis.control_cells * 0.5 + analysis.exposed_faces * 0.2

    def _maybe_shift_strategy(self, world_state: WorldState, tick: int) -> None:
        available = set(self.allowed_strategy_shifts)
        desired = self.current_strategy
        enemy_pressure = self.last_analysis.enemy_neighbors if self.last_analysis else 0
        support_risk = (
            self.last_analysis.cantilever + self.last_analysis.unsupported_height
            if self.last_analysis
            else 0
        )

        if "wrap" in available and enemy_pressure >= 2:
            desired = "wrap"
        elif "pillar" in available and support_risk >= 2:
            desired = "pillar"
        elif "reinforce" in available and self.last_analysis and self.last_analysis.exposed_faces >= 8:
            desired = "reinforce"
        elif "expand" in available:
            desired = "expand"

        if self.current_strategy != desired:
            previous_strategy = self.current_strategy
            self.current_strategy = desired
            self._record_event(
                tick=tick,
                action="strategy_shift",
                message=(
                    f"Builder {self.config.id} shifted from "
                    f"{previous_strategy} to {desired}."
                ),
                strategy=desired,
                strategy_before=previous_strategy,
                strategy_after=desired,
                status=self.status,
            )

    def _commit_placement(
        self,
        world_state: WorldState,
        tick: int,
        evaluation: CandidateEvaluation,
    ) -> BuilderStepResult:
        placement_id = f"{self.config.id}-{self.placement_count}"
        occupied_cells = world_state.occupy(
            self.shape,
            evaluation.candidate.anchor,
            evaluation.candidate.orientation,
            builder_id=self.config.id,
            placement_id=placement_id,
            tick=tick,
            supported=evaluation.analysis.support_path_exists,
        )
        score_events = tuple(
            ScoreEvent(
                category=category,
                points=points,
                reason=f"{evaluation.strategy} {category}",
            )
            for category, points in evaluation.score_breakdown.items()
            if abs(points) > 1e-6
        )
        for score_event in score_events:
            self.score_breakdown.setdefault(score_event.category, 0.0)
            self.score_breakdown[score_event.category] += score_event.points
            self.total_score += score_event.points

        self.placement_history.append(
            PlacementRecord(
                placement_id=placement_id,
                tick=tick,
                anchor=evaluation.candidate.anchor,
                orientation=evaluation.candidate.orientation,
                cells=occupied_cells,
                strategy=evaluation.strategy,
                reference_cell=evaluation.reference_cell,
                score_total=evaluation.total_score,
                supported=evaluation.analysis.support_path_exists,
            )
        )
        self.cell_history.extend(occupied_cells)
        self.last_anchor = evaluation.candidate.anchor
        self.last_orientation = evaluation.candidate.orientation
        self.last_analysis = evaluation.analysis
        self.placement_count += 1
        self.last_action = "placed"
        self.blocked_reason = None

        if score_events:
            self._record_event(
                tick=tick,
                action="score",
                message=(
                    f"Builder {self.config.id} scored {evaluation.total_score:.2f} "
                    f"points at tick {tick}."
                ),
                placement_id=placement_id,
                strategy=evaluation.strategy,
                reference_cell=evaluation.reference_cell,
                status=self.status,
                score_delta=evaluation.total_score,
                scores=score_events,
                support_path_exists=evaluation.analysis.support_path_exists,
                supported=evaluation.analysis.support_path_exists,
            )

        if evaluation.analysis.choke_points > 0:
            self._record_event(
                tick=tick,
                action="choke",
                message=(
                    f"Builder {self.config.id} created {evaluation.analysis.choke_points} "
                    "choke pressure."
                ),
                placement_id=placement_id,
                strategy=evaluation.strategy,
                reference_cell=evaluation.reference_cell,
                status=self.status,
                score_delta=0.0,
                support_path_exists=evaluation.analysis.support_path_exists,
                supported=evaluation.analysis.support_path_exists,
            )

        if (
            self.symmetry_mode != "none"
            and evaluation.score_breakdown.get("symmetry", 0.0) < 0
        ):
            self._record_event(
                tick=tick,
                action="symmetry_break",
                message=(
                    f"Builder {self.config.id} broke {self.symmetry_mode} balance."
                ),
                placement_id=placement_id,
                strategy=evaluation.strategy,
                reference_cell=evaluation.reference_cell,
                status=self.status,
                support_path_exists=evaluation.analysis.support_path_exists,
                supported=evaluation.analysis.support_path_exists,
            )

        return self._emit(
            tick,
            action="placed",
            message=(
                f"Builder {self.config.id} placed {self.shape.id} at "
                f"{evaluation.candidate.anchor} via {evaluation.strategy}."
            ),
            placement_id=placement_id,
            strategy=evaluation.strategy,
            reference_cell=evaluation.reference_cell,
            status=self.status,
            placed=True,
            cells=occupied_cells,
            score_total=evaluation.total_score,
            score_events=score_events,
            supported=evaluation.analysis.support_path_exists,
            analysis=evaluation.analysis,
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
            strategy=self.current_strategy,
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
        score_total: float = 0.0,
        score_events: tuple[ScoreEvent, ...] = (),
        supported: bool = False,
        analysis: Optional[PlacementAnalysis] = None,
    ) -> BuilderStepResult:
        if action != "placed":
            self.last_action = action
        self._record_event(
            tick=tick,
            action=action,
            message=message,
            placement_id=placement_id,
            strategy=strategy or self.current_strategy,
            reference_cell=reference_cell,
            status=status or self.status,
            score_delta=0.0 if action == "placed" else score_total,
            scores=score_events,
            support_path_exists=analysis.support_path_exists if analysis else None,
            supported=supported if analysis else None,
        )
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
            score_total=score_total,
            score_events=score_events,
            supported=supported,
            analysis=analysis,
        )

    def _record_event(
        self,
        tick: int,
        action: str,
        message: str,
        placement_id: Optional[str] = None,
        strategy: Optional[str] = None,
        reference_cell: Optional[Vector3] = None,
        status: Optional[str] = None,
        score_delta: float = 0.0,
        scores: tuple[ScoreEvent, ...] = (),
        strategy_before: Optional[str] = None,
        strategy_after: Optional[str] = None,
        support_path_exists: Optional[bool] = None,
        supported: Optional[bool] = None,
    ) -> None:
        self.trace.append(
            BuilderTraceEvent(
                tick=tick,
                builder_id=self.config.id,
                action=action,
                message=message,
                placement_id=placement_id,
                strategy=strategy,
                reference_cell=reference_cell,
                status=status or self.status,
                score_delta=score_delta,
                scores=scores,
                running_score=self.total_score,
                strategy_before=strategy_before,
                strategy_after=strategy_after,
                support_path_exists=support_path_exists,
                supported=supported,
            )
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
