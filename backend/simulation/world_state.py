from __future__ import annotations

from dataclasses import dataclass, field
from random import Random

from .shapes import BrickShape, HORIZONTAL_ORIENTATIONS, Vector3, absolute_cells


@dataclass
class WorldState:
    brick_unit: int
    cube_cage: int
    occupied_cells: set[Vector3] = field(default_factory=set)

    def can_place(self, shape: BrickShape, anchor: Vector3, orientation: str) -> bool:
        for x, y, z in absolute_cells(shape, anchor, orientation, self.brick_unit):
            if not self._within_bounds((x, y, z)):
                return False
            if (x, y, z) in self.occupied_cells:
                return False
        return True

    def occupy(self, shape: BrickShape, anchor: Vector3, orientation: str) -> list[Vector3]:
        cells = absolute_cells(shape, anchor, orientation, self.brick_unit)
        self.occupied_cells.update(cells)
        return cells

    def random_free_placement(
        self,
        shape: BrickShape,
        rng: Random,
        max_attempts: int = 5000,
    ) -> tuple[Vector3, str]:
        half = self.cube_cage // self.brick_unit
        for _ in range(max_attempts):
            anchor = (
                rng.randint(-half, half) * self.brick_unit,
                rng.randint(-half, half) * self.brick_unit,
                rng.randint(-half, half) * self.brick_unit,
            )
            orientation = rng.choice(HORIZONTAL_ORIENTATIONS)
            if self.can_place(shape, anchor, orientation):
                return anchor, orientation
        raise RuntimeError(
            "Could not find a free placement inside cube_cage; "
            "raise cage or reduce steps/builders."
        )

    def _within_bounds(self, cell: Vector3) -> bool:
        x, y, z = cell
        return (
            -self.cube_cage <= x <= self.cube_cage
            and -self.cube_cage <= y <= self.cube_cage
            and -self.cube_cage <= z <= self.cube_cage
        )
