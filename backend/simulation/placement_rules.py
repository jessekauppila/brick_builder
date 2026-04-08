from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Optional

from .shapes import HORIZONTAL_ORIENTATIONS, Vector3

PLACEMENT_RULES = {
    "alternating_sideways_vertical": "Alternating Sideways / Vertical",
    "alternating_with_support": "Alternating + Pillar Support",
    "competitive_growth": "Competitive Growth",
}

HORIZONTAL_DELTAS: dict[str, Vector3] = {
    "east": (1, 0, 0),
    "west": (-1, 0, 0),
    "north": (0, 1, 0),
    "south": (0, -1, 0),
}
VERTICAL_DELTAS: tuple[Vector3, Vector3] = ((0, 0, 1), (0, 0, -1))


@dataclass(frozen=True)
class PlacementCandidate:
    anchor: Vector3
    orientation: str
    mode: str
    source: str = "direct"


def list_placement_rules() -> list[dict[str, str]]:
    return [
        {"id": rule_id, "label": label}
        for rule_id, label in sorted(PLACEMENT_RULES.items())
    ]


def build_candidates(
    placement_rule_id: str,
    previous_anchor: Optional[Vector3],
    previous_orientation: Optional[str],
    start_anchor: Vector3,
    rng: Random,
    brick_unit: int,
    local_step: int,
    strategy_id: str = "expand",
) -> list[PlacementCandidate]:
    if placement_rule_id == "alternating_sideways_vertical":
        return _build_alternating_candidates(
            previous_anchor=previous_anchor,
            previous_orientation=previous_orientation,
            start_anchor=start_anchor,
            rng=rng,
            brick_unit=brick_unit,
            local_step=local_step,
        )

    if placement_rule_id == "alternating_with_support":
        return _build_alternating_with_support_candidates(
            previous_anchor=previous_anchor,
            previous_orientation=previous_orientation,
            start_anchor=start_anchor,
            rng=rng,
            brick_unit=brick_unit,
            local_step=local_step,
            strategy_id=strategy_id,
        )

    if placement_rule_id == "competitive_growth":
        return _build_competitive_candidates(
            previous_anchor=previous_anchor,
            previous_orientation=previous_orientation,
            start_anchor=start_anchor,
            rng=rng,
            brick_unit=brick_unit,
            strategy_id=strategy_id,
        )

    known_rules = ", ".join(sorted(PLACEMENT_RULES))
    raise ValueError(
        f"Unknown placement_rule_id '{placement_rule_id}'. "
        f"Expected one of: {known_rules}."
    )


def _build_alternating_candidates(
    previous_anchor: Optional[Vector3],
    previous_orientation: Optional[str],
    start_anchor: Vector3,
    rng: Random,
    brick_unit: int,
    local_step: int,
) -> list[PlacementCandidate]:
    if previous_anchor is None:
        seed_orientation = rng.choice(HORIZONTAL_ORIENTATIONS)
        return [
            PlacementCandidate(
                anchor=start_anchor,
                orientation=seed_orientation,
                mode="seed",
            )
        ]

    if local_step % 2 == 1:
        directions = list(HORIZONTAL_ORIENTATIONS)
        rng.shuffle(directions)
        return [
            PlacementCandidate(
                anchor=_translate(previous_anchor, HORIZONTAL_DELTAS[direction], brick_unit),
                orientation=direction,
                mode="sideways",
            )
            for direction in directions
        ]

    vertical_deltas = list(VERTICAL_DELTAS)
    rng.shuffle(vertical_deltas)
    orientation = previous_orientation or "east"
    return [
        PlacementCandidate(
            anchor=_translate(previous_anchor, delta, brick_unit),
            orientation=orientation,
            mode="vertical",
        )
        for delta in vertical_deltas
    ]


def _build_alternating_with_support_candidates(
    previous_anchor: Optional[Vector3],
    previous_orientation: Optional[str],
    start_anchor: Vector3,
    rng: Random,
    brick_unit: int,
    local_step: int,
    strategy_id: str,
) -> list[PlacementCandidate]:
    """Alternate sideways/vertical like the basic rule, but when the strategy
    shifts to ``pillar`` (structural problem detected by the builder agent),
    generate pillar-down candidates to build support before resuming."""
    if previous_anchor is None:
        seed_orientation = rng.choice(HORIZONTAL_ORIENTATIONS)
        return [
            PlacementCandidate(
                anchor=start_anchor,
                orientation=seed_orientation,
                mode="seed",
            )
        ]

    orientation = previous_orientation or "east"

    if strategy_id == "pillar":
        candidates: list[PlacementCandidate] = [
            PlacementCandidate(
                anchor=_translate(previous_anchor, (0, 0, -1), brick_unit),
                orientation=orientation,
                mode="pillar_down",
            ),
        ]
        horiz = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)]
        rng.shuffle(horiz)
        for delta in horiz:
            candidates.append(
                PlacementCandidate(
                    anchor=_translate(previous_anchor, delta, brick_unit),
                    orientation=orientation,
                    mode="brace",
                )
            )
        candidates.append(
            PlacementCandidate(
                anchor=_translate(previous_anchor, (0, 0, 1), brick_unit),
                orientation=orientation,
                mode="pillar_up",
            )
        )
        return candidates

    if strategy_id == "reinforce":
        candidates = []
        vert = [(0, 0, -1), (0, 0, 1)]
        rng.shuffle(vert)
        for delta in vert:
            candidates.append(
                PlacementCandidate(
                    anchor=_translate(previous_anchor, delta, brick_unit),
                    orientation=orientation,
                    mode="brace",
                )
            )
        horiz = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)]
        rng.shuffle(horiz)
        for delta in horiz:
            candidates.append(
                PlacementCandidate(
                    anchor=_translate(previous_anchor, delta, brick_unit),
                    orientation=orientation,
                    mode="thicken",
                )
            )
        return candidates

    if local_step % 2 == 1:
        directions = list(HORIZONTAL_ORIENTATIONS)
        rng.shuffle(directions)
        return [
            PlacementCandidate(
                anchor=_translate(previous_anchor, HORIZONTAL_DELTAS[direction], brick_unit),
                orientation=direction,
                mode="sideways",
            )
            for direction in directions
        ]

    vertical_deltas = list(VERTICAL_DELTAS)
    rng.shuffle(vertical_deltas)
    return [
        PlacementCandidate(
            anchor=_translate(previous_anchor, delta, brick_unit),
            orientation=orientation,
            mode="vertical",
        )
        for delta in vertical_deltas
    ]


def _build_competitive_candidates(
    previous_anchor: Optional[Vector3],
    previous_orientation: Optional[str],
    start_anchor: Vector3,
    rng: Random,
    brick_unit: int,
    strategy_id: str,
) -> list[PlacementCandidate]:
    if previous_anchor is None:
        seed_orientation = rng.choice(HORIZONTAL_ORIENTATIONS)
        return [
            PlacementCandidate(
                anchor=start_anchor,
                orientation=seed_orientation,
                mode="seed",
            )
        ]

    orientation = previous_orientation or rng.choice(HORIZONTAL_ORIENTATIONS)
    move_specs: list[tuple[str, tuple[Vector3, ...], tuple[str, ...]]] = []

    if strategy_id == "pillar":
        move_specs.extend(
            [
                ("pillar_down", ((0, 0, -1),), (orientation,)),
                ("pillar_up", ((0, 0, 1),), (orientation,)),
                ("brace", ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)), HORIZONTAL_ORIENTATIONS),
            ]
        )
    elif strategy_id == "reinforce":
        move_specs.extend(
            [
                ("brace", ((0, 0, -1), (0, 0, 1)), (orientation,)),
                ("thicken", ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)), HORIZONTAL_ORIENTATIONS),
            ]
        )
    elif strategy_id == "wrap":
        move_specs.extend(
            [
                ("wrap", ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)), HORIZONTAL_ORIENTATIONS),
                ("climb", ((0, 0, 1), (0, 0, -1)), (orientation,)),
            ]
        )
    else:
        move_specs.extend(
            [
                ("extend", ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0)), HORIZONTAL_ORIENTATIONS),
                ("rise", ((0, 0, 1), (0, 0, -1)), (orientation,)),
            ]
        )

    candidates: list[PlacementCandidate] = []
    for mode, deltas, orientations in move_specs:
        shuffled_deltas = list(deltas)
        shuffled_orientations = list(orientations)
        rng.shuffle(shuffled_deltas)
        rng.shuffle(shuffled_orientations)
        for delta in shuffled_deltas:
            for candidate_orientation in shuffled_orientations:
                candidates.append(
                    PlacementCandidate(
                        anchor=_translate(previous_anchor, delta, brick_unit),
                        orientation=candidate_orientation,
                        mode=mode,
                    )
                )
    return _dedupe_candidates(candidates)


def _dedupe_candidates(
    candidates: list[PlacementCandidate],
) -> list[PlacementCandidate]:
    seen: set[tuple[Vector3, str]] = set()
    unique_candidates: list[PlacementCandidate] = []
    for candidate in candidates:
        key = (candidate.anchor, candidate.orientation)
        if key in seen:
            continue
        unique_candidates.append(candidate)
        seen.add(key)
    return unique_candidates


def _translate(anchor: Vector3, delta: Vector3, brick_unit: int) -> Vector3:
    anchor_x, anchor_y, anchor_z = anchor
    delta_x, delta_y, delta_z = delta
    return (
        anchor_x + delta_x * brick_unit,
        anchor_y + delta_y * brick_unit,
        anchor_z + delta_z * brick_unit,
    )
