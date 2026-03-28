import random
import unittest

from backend.simulation.brick_model import BrickModel, BuilderConfig
from backend.simulation.builder_agent import BuilderAgent
from backend.simulation.balance_harness import run_matchup_series, summarize_matchup_series
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
                "id": "fortress-red",
                "color": "#ef4444",
                "shapeId": "bar_2x1",
                "startAnchor": (0, 0, 0),
                "placementRuleId": "competitive_growth",
                "maxPlacements": 5,
                "failurePolicy": "backtrack",
                "continuityMode": "strict",
                "maxBacktrackDepth": 20,
                "archetype": "fortress",
                "initialStrategy": "reinforce",
                "allowedStrategyShifts": ["expand", "reinforce", "pillar"],
            },
            {
                "id": "vine-blue",
                "color": "#38bdf8",
                "shapeId": "bar_2x1",
                "startAnchor": (40, 0, 0),
                "placementRuleId": "competitive_growth",
                "maxPlacements": 4,
                "failurePolicy": "stop",
                "continuityMode": "strict",
                "maxBacktrackDepth": 20,
                "archetype": "vine",
                "initialStrategy": "expand",
                "allowedStrategyShifts": ["expand", "wrap"],
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

        self.assertIn("timeline", result)
        self.assertGreaterEqual(len(result["timeline"]), 1)
        self.assertIn("score", result["builderStates"][0])
        self.assertIn("scoreBreakdown", result["builderStates"][0])

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
                "id": "fortress-red",
                "color": "#ef4444",
                "shapeId": "bar_2x1",
                "startAnchor": (0, 0, 0),
                "placementRuleId": "competitive_growth",
                "maxPlacements": 2,
                "failurePolicy": "backtrack",
                "continuityMode": "strict",
                "maxBacktrackDepth": 10,
                "archetype": "fortress",
                "initialStrategy": "reinforce",
                "allowedStrategyShifts": ["expand", "reinforce", "pillar"],
            },
            {
                "id": "vine-blue",
                "color": "#38bdf8",
                "shapeId": "bar_2x1",
                "startAnchor": (40, 0, 0),
                "placementRuleId": "competitive_growth",
                "maxPlacements": 1,
                "failurePolicy": "stop",
                "continuityMode": "strict",
                "maxBacktrackDepth": 10,
                "archetype": "vine",
                "initialStrategy": "expand",
                "allowedStrategyShifts": ["expand", "wrap"],
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

        self.assertEqual(
            {"fortress-red", "vine-blue"},
            {item["id"] for item in result["builderStates"]},
        )
        self.assertEqual(
            {"fortress-red", "vine-blue"},
            {brick["builderId"] for brick in result["bricks"]},
        )
        self.assertEqual(3, result["metadata"]["placementCount"])
        self.assertTrue(all("currentStrategy" in item for item in result["builderStates"]))


class BuilderAgentFailurePolicyTests(unittest.TestCase):
    def test_skip_policy_keeps_builder_active(self):
        world = WorldState(brick_unit=10, cube_cage=20)
        config = BuilderConfig(
            id="skipper",
            shape_id="single_1x1",
            placement_rule_id="alternating_sideways_vertical",
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
                (last_anchor[0], last_anchor[1], last_anchor[2] + 10),
                (last_anchor[0], last_anchor[1], last_anchor[2] - 10),
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
            placement_rule_id="alternating_sideways_vertical",
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
                (last_anchor[0], last_anchor[1], last_anchor[2] + 10),
                (last_anchor[0], last_anchor[1], last_anchor[2] - 10),
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
            placement_rule_id="alternating_sideways_vertical",
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
        self.assertTrue(result.strategy.startswith("backtrack_"))
        self.assertEqual(first_cell, result.reference_cell)


class BalanceHarnessTests(unittest.TestCase):
    def test_matchup_series_runs_without_scad_exports(self):
        builders = [
            BuilderConfig(
                id="fortress-red",
                color="#ef4444",
                archetype="fortress",
                objective_weights={"support": 2.0, "enclosure": 2.0},
                allowed_strategy_shifts=("expand", "reinforce", "pillar"),
                initial_strategy="reinforce",
            ),
            BuilderConfig(
                id="vine-blue",
                color="#38bdf8",
                archetype="vine",
                objective_weights={"chain": 2.2, "choke": 1.7},
                allowed_strategy_shifts=("expand", "wrap"),
                initial_strategy="expand",
            ),
        ]

        results = run_matchup_series(
            builder_configs=builders,
            seeds=[1, 2],
            total_steps=6,
            cube_cage=80,
        )

        self.assertEqual(2, len(results))
        summary = summarize_matchup_series(results)
        self.assertEqual(2, summary["matchCount"])
        self.assertIn("averageScoreGap", summary)
        self.assertTrue(summary["results"])


if __name__ == "__main__":
    unittest.main()
