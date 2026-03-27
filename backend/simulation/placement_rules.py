from __future__ import annotations

from dataclasses import dataclass
from random import Random
from typing import Optional

from .shapes import HORIZONTAL_ORIENTATIONS, Vector3

PLACEMENT_RULES = {
    "alternating_sideways_vertical": "Alternating Sideways / Vertical",
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
) -> list[PlacementCandidate]:
    if placement_rule_id not in {"alternating_sideways_vertical", "competitive_growth"}:
        known_rules = ", ".join(sorted(PLACEMENT_RULES))
        raise ValueError(
            f"Unknown placement_rule_id '{placement_rule_id}'. "
            f"Expected one of: {known_rules}."
        )

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


def _translate(anchor: Vector3, delta: Vector3, brick_unit: int) -> Vector3:
    anchor_x, anchor_y, anchor_z = anchor
    delta_x, delta_y, delta_z = delta
    return (
        anchor_x + delta_x * brick_unit,
        anchor_y + delta_y * brick_unit,
        anchor_z + delta_z * brick_unit,
    )
