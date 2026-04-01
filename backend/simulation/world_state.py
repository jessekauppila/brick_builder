from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field
from random import Random

from .shapes import BrickShape, HORIZONTAL_ORIENTATIONS, Vector3, absolute_cells

ORTHOGONAL_DELTAS: tuple[Vector3, ...] = (
    (1, 0, 0),
    (-1, 0, 0),
    (0, 1, 0),
    (0, -1, 0),
    (0, 0, 1),
    (0, 0, -1),
)


@dataclass(frozen=True)
class OccupiedCell:
    builder_id: str
    placement_id: str
    tick: int
    supported: bool


@dataclass(frozen=True)
class PlacementAnalysis:
    valid: bool
    cells: list[Vector3]
    collision_cells: list[Vector3]
    out_of_bounds_cells: list[Vector3]
    friendly_neighbors: int
    enemy_neighbors: int
    enemy_contact_builders: list[str]
    exposed_faces: int
    support_contacts: int
    control_cells: int
    choke_points: int
    touches_ground: bool
    support_path_exists: bool
    cantilever: int
    unsupported_height: int

    def to_dict(self) -> dict[str, object]:
        return {
            "valid": self.valid,
            "cells": [list(cell) for cell in self.cells],
            "collisionCells": [list(cell) for cell in self.collision_cells],
            "outOfBoundsCells": [list(cell) for cell in self.out_of_bounds_cells],
            "friendlyNeighbors": self.friendly_neighbors,
            "enemyNeighbors": self.enemy_neighbors,
            "enemyContactBuilders": self.enemy_contact_builders,
            "exposedFaces": self.exposed_faces,
            "supportContacts": self.support_contacts,
            "controlCells": self.control_cells,
            "chokePoints": self.choke_points,
            "touchesGround": self.touches_ground,
            "supportPathExists": self.support_path_exists,
            "cantilever": self.cantilever,
            "unsupportedHeight": self.unsupported_height,
        }


@dataclass
class WorldState:
    brick_unit: int
    cube_cage: int
    occupied_cells: set[Vector3] = field(default_factory=set)
    occupied_metadata: dict[Vector3, OccupiedCell] = field(default_factory=dict)

    def can_place(self, shape: BrickShape, anchor: Vector3, orientation: str) -> bool:
        return self.analyze_placement(
            shape=shape,
            anchor=anchor,
            orientation=orientation,
            builder_id="",
        ).valid

    def occupy(
        self,
        shape: BrickShape,
        anchor: Vector3,
        orientation: str,
        builder_id: str,
        placement_id: str,
        tick: int,
        supported: bool,
    ) -> list[Vector3]:
        cells = absolute_cells(shape, anchor, orientation, self.brick_unit)
        self.occupied_cells.update(cells)
        for cell in cells:
            self.occupied_metadata[cell] = OccupiedCell(
                builder_id=builder_id,
                placement_id=placement_id,
                tick=tick,
                supported=supported,
            )
        return cells

    def random_free_placement(
        self,
        shape: BrickShape,
        rng: Random,
        max_attempts: int = 5000,
    ) -> tuple[Vector3, str]:
        half = self.cube_cage // self.brick_unit
        z_max = self.cube_cage // self.brick_unit
        for _ in range(max_attempts):
            anchor = (
                rng.randint(-half, half) * self.brick_unit,
                rng.randint(-half, half) * self.brick_unit,
                rng.randint(0, z_max) * self.brick_unit,
            )
            orientation = rng.choice(HORIZONTAL_ORIENTATIONS)
            if self.can_place(shape, anchor, orientation):
                return anchor, orientation
        raise RuntimeError(
            "Could not find a free placement inside cube_cage; "
            "raise cage or reduce steps/builders."
        )

    def analyze_placement(
        self,
        shape: BrickShape,
        anchor: Vector3,
        orientation: str,
        builder_id: str,
    ) -> PlacementAnalysis:
        cells = absolute_cells(shape, anchor, orientation, self.brick_unit)
        cell_set = set(cells)
        collision_cells: list[Vector3] = []
        out_of_bounds_cells: list[Vector3] = []
        friendly_neighbors = 0
        enemy_neighbors = 0
        support_contacts = 0
        exposed_faces = 0
        control_cells: set[Vector3] = set()
        enemy_contact_builders: set[str] = set()
        touches_ground = False

        for cell in cells:
            if not self._within_bounds(cell):
                out_of_bounds_cells.append(cell)
            if cell in self.occupied_cells:
                collision_cells.append(cell)
            if cell[2] <= 0:
                touches_ground = True

        for cell in cells:
            for neighbor in self._neighbors(cell):
                if neighbor in cell_set:
                    continue
                if not self._within_bounds(neighbor):
                    continue
                metadata = self.occupied_metadata.get(neighbor)
                if metadata is None:
                    exposed_faces += 1
                    control_cells.add(neighbor)
                    continue
                if builder_id and metadata.builder_id == builder_id:
                    friendly_neighbors += 1
                else:
                    enemy_neighbors += 1
                    enemy_contact_builders.add(metadata.builder_id)
                if neighbor[0] == cell[0] and neighbor[1] == cell[1] and neighbor[2] < cell[2]:
                    support_contacts += 1

            if self._has_vertical_support(cell, cell_set):
                support_contacts += 1

        support_path_exists = self._has_support_path(cell_set)
        cantilever = self._estimate_cantilever(cell_set)
        unsupported_height = self._estimate_unsupported_height(cell_set)
        choke_points = min(
            len(control_cells),
            max(0, enemy_neighbors - max(0, exposed_faces - friendly_neighbors)),
        )

        return PlacementAnalysis(
            valid=not collision_cells and not out_of_bounds_cells,
            cells=cells,
            collision_cells=collision_cells,
            out_of_bounds_cells=out_of_bounds_cells,
            friendly_neighbors=friendly_neighbors,
            enemy_neighbors=enemy_neighbors,
            enemy_contact_builders=sorted(enemy_contact_builders),
            exposed_faces=exposed_faces,
            support_contacts=support_contacts,
            control_cells=len(control_cells),
            choke_points=choke_points,
            touches_ground=touches_ground,
            support_path_exists=support_path_exists,
            cantilever=cantilever,
            unsupported_height=unsupported_height,
        )

    def builder_cells(self, builder_id: str) -> list[Vector3]:
        return [
            cell
            for cell, metadata in self.occupied_metadata.items()
            if metadata.builder_id == builder_id
        ]

    def enemy_cells(self, builder_id: str) -> list[Vector3]:
        return [
            cell
            for cell, metadata in self.occupied_metadata.items()
            if metadata.builder_id != builder_id
        ]

    def control_neighbors(self, cells: list[Vector3]) -> set[Vector3]:
        cell_set = set(cells)
        control_cells: set[Vector3] = set()
        for cell in cells:
            for neighbor in self._neighbors(cell):
                if neighbor in cell_set or neighbor in self.occupied_cells:
                    continue
                if self._within_bounds(neighbor):
                    control_cells.add(neighbor)
        return control_cells

    def supported_fraction_for_builder(self, builder_id: str) -> float:
        builder_cells = [
            metadata.supported
            for metadata in self.occupied_metadata.values()
            if metadata.builder_id == builder_id
        ]
        if not builder_cells:
            return 1.0
        return sum(1 for supported in builder_cells if supported) / len(builder_cells)

    def _within_bounds(self, cell: Vector3) -> bool:
        x, y, z = cell
        return (
            -self.cube_cage <= x <= self.cube_cage
            and -self.cube_cage <= y <= self.cube_cage
            and 0 <= z <= self.cube_cage
        )

    def _neighbors(self, cell: Vector3) -> list[Vector3]:
        x, y, z = cell
        return [
            (
                x + delta_x * self.brick_unit,
                y + delta_y * self.brick_unit,
                z + delta_z * self.brick_unit,
            )
            for delta_x, delta_y, delta_z in ORTHOGONAL_DELTAS
        ]

    def _has_vertical_support(
        self, cell: Vector3, candidate_cells: set[Vector3]
    ) -> bool:
        x, y, z = cell
        below = (x, y, z - self.brick_unit)
        return z <= 0 or below in candidate_cells or below in self.occupied_cells

    def _has_support_path(self, candidate_cells: set[Vector3]) -> bool:
        combined_cells = self.occupied_cells | candidate_cells
        if not candidate_cells:
            return False

        queue: deque[Vector3] = deque(
            [cell for cell in combined_cells if cell[2] <= 0 or self._has_grounded_support(cell)]
        )
        visited = set(queue)
        while queue:
            cell = queue.popleft()
            for neighbor in self._neighbors(cell):
                if neighbor not in combined_cells or neighbor in visited:
                    continue
                visited.add(neighbor)
                queue.append(neighbor)
        return candidate_cells.issubset(visited)

    def _has_grounded_support(self, cell: Vector3) -> bool:
        x, y, z = cell
        return (x, y, z - self.brick_unit) in self.occupied_cells

    def _estimate_cantilever(self, candidate_cells: set[Vector3]) -> int:
        support_columns: set[tuple[int, int]] = set()
        for cell in self.occupied_cells | candidate_cells:
            x, y, z = cell
            if z <= 0 or (x, y, z - self.brick_unit) in self.occupied_cells | candidate_cells:
                support_columns.add((x, y))
        if not support_columns:
            return 0

        max_distance = 0
        for x, y, _ in candidate_cells:
            max_distance = max(
                max_distance,
                min(abs(x - support_x) + abs(y - support_y) for support_x, support_y in support_columns)
                // self.brick_unit,
            )
        return max_distance

    def _estimate_unsupported_height(self, candidate_cells: set[Vector3]) -> int:
        combined_cells = self.occupied_cells | candidate_cells
        max_gap = 0
        for x, y, z in candidate_cells:
            gap = 0
            current_z = z
            while current_z > 0 and (x, y, current_z - self.brick_unit) not in combined_cells:
                gap += 1
                current_z -= self.brick_unit
            max_gap = max(max_gap, gap)
        return max_gap
