"""Stop 02: deterministic tests for WorldState spatial analysis helpers."""

import unittest

from backend.simulation.shapes import get_shape
from backend.simulation.world_state import WorldState


class WorldStateSpatialTests(unittest.TestCase):
    def setUp(self) -> None:
        self.brick_unit = 10
        self.cube_cage = 200
        self.shape_1x1 = get_shape("single_1x1")

    def test_analyze_ground_placement_valid_and_support_path(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        analysis = world.analyze_placement(
            self.shape_1x1,
            anchor=(0, 0, 0),
            orientation="east",
            builder_id="alpha",
        )
        self.assertTrue(analysis.valid)
        self.assertTrue(analysis.touches_ground)
        self.assertTrue(analysis.support_path_exists)
        self.assertEqual(analysis.collision_cells, [])
        self.assertEqual(analysis.out_of_bounds_cells, [])

    def test_analyze_collision_invalid(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        world.occupy(
            self.shape_1x1,
            anchor=(0, 0, 0),
            orientation="east",
            builder_id="blocker",
            placement_id="p0",
            tick=0,
            supported=True,
        )
        analysis = world.analyze_placement(
            self.shape_1x1,
            anchor=(0, 0, 0),
            orientation="east",
            builder_id="other",
        )
        self.assertFalse(analysis.valid)
        self.assertTrue(analysis.collision_cells)

    def test_analyze_out_of_bounds(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        far = self.cube_cage + self.brick_unit * 100
        analysis = world.analyze_placement(
            self.shape_1x1,
            anchor=(far, 0, 0),
            orientation="east",
            builder_id="alpha",
        )
        self.assertFalse(analysis.valid)
        self.assertTrue(analysis.out_of_bounds_cells)

    def test_friendly_vs_enemy_neighbors(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        world.occupy(
            self.shape_1x1,
            anchor=(self.brick_unit, 0, 0),
            orientation="east",
            builder_id="ally",
            placement_id="a1",
            tick=0,
            supported=True,
        )
        world.occupy(
            self.shape_1x1,
            anchor=(0, self.brick_unit, 0),
            orientation="east",
            builder_id="foe",
            placement_id="e1",
            tick=0,
            supported=True,
        )
        analysis = world.analyze_placement(
            self.shape_1x1,
            anchor=(0, 0, 0),
            orientation="east",
            builder_id="ally",
        )
        self.assertTrue(analysis.valid)
        self.assertGreaterEqual(analysis.friendly_neighbors, 1)
        self.assertGreaterEqual(analysis.enemy_neighbors, 1)
        self.assertIn("foe", analysis.enemy_contact_builders)

    def test_builder_cells_filters_by_builder(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        world.occupy(
            self.shape_1x1,
            anchor=(0, 0, 0),
            orientation="east",
            builder_id="a",
            placement_id="a0",
            tick=0,
            supported=True,
        )
        world.occupy(
            self.shape_1x1,
            anchor=(self.brick_unit, 0, 0),
            orientation="east",
            builder_id="b",
            placement_id="b0",
            tick=0,
            supported=True,
        )
        cells_a = world.builder_cells("a")
        cells_b = world.builder_cells("b")
        self.assertEqual(len(cells_a), 1)
        self.assertEqual(len(cells_b), 1)
        self.assertNotEqual(cells_a[0], cells_b[0])

    def test_control_neighbors_adjacent_empty(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        cells = [(0, 0, 0)]
        control = world.control_neighbors(cells)
        expected = {
            (self.brick_unit, 0, 0),
            (-self.brick_unit, 0, 0),
            (0, self.brick_unit, 0),
            (0, -self.brick_unit, 0),
            (0, 0, self.brick_unit),
            (0, 0, -self.brick_unit),
        }
        self.assertEqual(control, expected)

    def test_supported_fraction_for_builder(self) -> None:
        world = WorldState(brick_unit=self.brick_unit, cube_cage=self.cube_cage)
        self.assertEqual(world.supported_fraction_for_builder("nobody"), 1.0)
        world.occupy(
            self.shape_1x1,
            anchor=(0, 0, 0),
            orientation="east",
            builder_id="mix",
            placement_id="m0",
            tick=0,
            supported=True,
        )
        world.occupy(
            self.shape_1x1,
            anchor=(self.brick_unit, 0, 0),
            orientation="east",
            builder_id="mix",
            placement_id="m1",
            tick=0,
            supported=False,
        )
        self.assertEqual(world.supported_fraction_for_builder("mix"), 0.5)


if __name__ == "__main__":
    unittest.main()
