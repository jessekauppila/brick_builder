import random
import unittest

from backend.simulation.brick_model import BrickModel, BuilderConfig
from backend.simulation.builder_agent import BuilderAgent
from backend.simulation.shapes import get_shape
from backend.simulation.world_state import WorldState


def shares_face(cells_a, occupied_cells, brick_unit):
    for ax, ay, az in cells_a:
        for dx, dy, dz in (
            (brick_unit, 0, 0),
            (-brick_unit, 0, 0),
            (0, brick_unit, 0),
            (0, -brick_unit, 0),
            (0, 0, brick_unit),
            (0, 0, -brick_unit),
        ):
            if (ax + dx, ay + dy, az + dz) in occupied_cells:
                return True
    return False


class BrickModelContinuityTests(unittest.TestCase):
    def test_each_builder_remains_continuous(self):
        builders = [
            {
                "id": "red",
                "color": "Red",
                "shapeId": "bar_2x1",
                "startAnchor": (0, 0, 0),
                "placementRuleId": "alternating_sideways_vertical",
                "maxPlacements": 5,
                "failurePolicy": "backtrack",
                "continuityMode": "strict",
                "maxBacktrackDepth": 20,
            },
            {
                "id": "blue",
                "color": "Blue",
                "shapeId": "bar_2x1",
                "startAnchor": (40, 0, 0),
                "placementRuleId": "alternating_sideways_vertical",
                "maxPlacements": 4,
                "failurePolicy": "stop",
                "continuityMode": "strict",
                "maxBacktrackDepth": 20,
            },
        ]

        model = BrickModel(
            total_steps=20,
            cube_cage=80,
            builders=builders,
            rng=random.Random(7),
            verbose=False,
        )
        model.run()
        result = model.to_dict()

        self.assertNotIn(
            "fallback_random",
            [event["strategy"] for event in result["trace"] if event["strategy"]],
        )

        placements_by_builder = {}
        for brick in result["bricks"]:
            placements_by_builder.setdefault(brick["builderId"], {}).setdefault(
                brick["placementId"], []
            ).append(tuple(brick["position"]))

        for builder_id, placements in placements_by_builder.items():
            occupied = set()
            for index, placement_id in enumerate(sorted(placements.keys())):
                cells = placements[placement_id]
                if index > 0:
                    self.assertTrue(
                        shares_face(cells, occupied, result["metadata"]["brickUnit"]),
                        msg=f"{builder_id} placement {placement_id} broke continuity",
                    )
                occupied.update(cells)

    def test_mixed_builders_report_independent_runtime_state(self):
        builders = [
            {
                "id": "red",
                "color": "Red",
                "shapeId": "bar_2x1",
                "startAnchor": (0, 0, 0),
                "placementRuleId": "alternating_sideways_vertical",
                "maxPlacements": 2,
                "failurePolicy": "backtrack",
                "continuityMode": "strict",
                "maxBacktrackDepth": 10,
            },
            {
                "id": "blue",
                "color": "Blue",
                "shapeId": "bar_2x1",
                "startAnchor": (40, 0, 0),
                "placementRuleId": "alternating_sideways_vertical",
                "maxPlacements": 1,
                "failurePolicy": "stop",
                "continuityMode": "strict",
                "maxBacktrackDepth": 10,
            },
        ]
        model = BrickModel(
            total_steps=10,
            cube_cage=60,
            builders=builders,
            rng=random.Random(3),
            verbose=False,
        )
        model.run()
        result = model.to_dict()

        self.assertEqual({"red", "blue"}, {item["id"] for item in result["builderStates"]})
        self.assertEqual({"red", "blue"}, {brick["builderId"] for brick in result["bricks"]})
        self.assertEqual(3, result["metadata"]["placementCount"])


class BuilderAgentFailurePolicyTests(unittest.TestCase):
    def test_skip_policy_keeps_builder_active(self):
        world = WorldState(brick_unit=10, cube_cage=20)
        config = BuilderConfig(
            id="skipper",
            shape_id="single_1x1",
            failure_policy="skip",
            max_placements=5,
        )
        agent = BuilderAgent(
            config=config,
            shape=get_shape(config.shape_id),
            brick_unit=10,
            rng=random.Random(0),
            verbose=False,
        )
        agent.step(world, 0)
        last_anchor = agent.last_anchor
        world.occupied_cells.update(
            {
                (last_anchor[0] + 10, last_anchor[1], last_anchor[2]),
                (last_anchor[0] - 10, last_anchor[1], last_anchor[2]),
                (last_anchor[0], last_anchor[1] + 10, last_anchor[2]),
                (last_anchor[0], last_anchor[1] - 10, last_anchor[2]),
            }
        )

        result = agent.step(world, 1)
        self.assertFalse(result.placed)
        self.assertEqual("skipped", result.action)
        self.assertEqual("active", agent.status)
        self.assertEqual(1, agent.placement_count)

    def test_stop_policy_blocks_builder(self):
        world = WorldState(brick_unit=10, cube_cage=20)
        config = BuilderConfig(
            id="stopper",
            shape_id="single_1x1",
            failure_policy="stop",
            max_placements=5,
        )
        agent = BuilderAgent(
            config=config,
            shape=get_shape(config.shape_id),
            brick_unit=10,
            rng=random.Random(0),
            verbose=False,
        )
        agent.step(world, 0)
        last_anchor = agent.last_anchor
        world.occupied_cells.update(
            {
                (last_anchor[0] + 10, last_anchor[1], last_anchor[2]),
                (last_anchor[0] - 10, last_anchor[1], last_anchor[2]),
                (last_anchor[0], last_anchor[1] + 10, last_anchor[2]),
                (last_anchor[0], last_anchor[1] - 10, last_anchor[2]),
            }
        )

        result = agent.step(world, 1)
        self.assertFalse(result.placed)
        self.assertEqual("blocked", result.action)
        self.assertEqual("blocked", agent.status)

    def test_backtrack_policy_uses_prior_cells(self):
        world = WorldState(brick_unit=10, cube_cage=30)
        config = BuilderConfig(
            id="backtracker",
            shape_id="single_1x1",
            failure_policy="backtrack",
            max_placements=5,
            max_backtrack_depth=10,
        )
        agent = BuilderAgent(
            config=config,
            shape=get_shape(config.shape_id),
            brick_unit=10,
            rng=random.Random(0),
            verbose=False,
        )

        agent.step(world, 0)
        agent.step(world, 1)

        latest_cell = agent.last_anchor
        first_cell = agent.placement_history[0].cells[0]
        world.occupied_cells.update(
            {
                (latest_cell[0], latest_cell[1], latest_cell[2] + 10),
                (latest_cell[0], latest_cell[1], latest_cell[2] - 10),
            }
        )

        result = agent.step(world, 2)
        self.assertTrue(result.placed)
        self.assertEqual("placed", result.action)
        self.assertEqual("backtrack_vertical", result.strategy)
        self.assertEqual(first_cell, result.reference_cell)



class Stop03SelectionModeTests(unittest.TestCase):
    def test_non_fortress_competitive_matches_legacy(self):
        """Competitive selection is ignored unless archetype is fortress."""
        base = {
            "id": "t1",
            "color": "Red",
            "shapeId": "bar_2x1",
            "startAnchor": (0, 0, 0),
            "placementRuleId": "alternating_sideways_vertical",
            "maxPlacements": 4,
            "failurePolicy": "backtrack",
            "continuityMode": "strict",
            "maxBacktrackDepth": 20,
            "archetype": "territorial",
        }
        legacy = dict(base, selectionMode="legacy")
        competitive = dict(base, selectionMode="competitive")
        rng_seed = random.Random(11)
        model_a = BrickModel(
            total_steps=8,
            cube_cage=80,
            builders=[legacy],
            rng=rng_seed,
            verbose=False,
        )
        model_a.run()
        rng_seed = random.Random(11)
        model_b = BrickModel(
            total_steps=8,
            cube_cage=80,
            builders=[competitive],
            rng=rng_seed,
            verbose=False,
        )
        model_b.run()
        bricks_a = [b["position"] for b in model_a.to_dict()["bricks"]]
        bricks_b = [b["position"] for b in model_b.to_dict()["bricks"]]
        self.assertEqual(bricks_a, bricks_b)

    def test_fortress_competitive_is_deterministic(self):
        builder = {
            "id": "fortress-test",
            "archetype": "fortress",
            "shapeId": "bar_2x1",
            "startAnchor": (0, 0, 0),
            "placementRuleId": "competitive_growth",
            "maxPlacements": 12,
            "failurePolicy": "backtrack",
            "continuityMode": "strict",
            "maxBacktrackDepth": 80,
            "selectionMode": "competitive",
        }

        def run_once():
            model = BrickModel(
                total_steps=20,
                cube_cage=100,
                builders=[builder],
                rng=random.Random(13),
                verbose=False,
            )
            model.run()
            return [tuple(b["position"]) for b in model.to_dict()["bricks"]]

        self.assertEqual(run_once(), run_once())

    def test_fortress_competitive_runs_successfully(self):
        from backend.simulation.brick_model import run_simulation

        result = run_simulation(
            total_steps=20,
            cube_cage=100,
            scad_output_path=None,
            json_output_path=None,
            seed=13,
            builders=[
                {
                    "id": "fortress-test",
                    "archetype": "fortress",
                    "shapeId": "bar_2x1",
                    "startAnchor": [0, 0, 0],
                    "placementRuleId": "competitive_growth",
                    "maxPlacements": 40,
                    "failurePolicy": "backtrack",
                    "continuityMode": "strict",
                    "maxBacktrackDepth": 80,
                    "selectionMode": "competitive",
                }
            ],
            verbose=False,
        )
        self.assertEqual(result["builderStates"][0]["id"], "fortress-test")
        self.assertGreater(result["metadata"]["placementCount"], 0)



if __name__ == "__main__":
    unittest.main()
