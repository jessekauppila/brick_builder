---
name: Stop 03 Engine Scoring Flag
overview: Introduce scored candidate evaluation behind an explicit feature flag and enable archetype behavior in a controlled rollout.
todos:
  - id: engine-score-path
    content: Implement scored candidate path in builder agent
    status: pending
  - id: engine-mode-gate
    content: Add explicit legacy vs competitive selection gate with legacy default
    status: pending
  - id: engine-fortress-rollout
    content: Enable and validate fortress-only competitive path first
    status: pending
  - id: engine-stop3-regression
    content: Confirm legacy behavior regression-safe via tests
    status: pending
isProject: false
---

# Stop 03: Engine Scored Candidates (Flagged Rollout)

## Track

Engine

## Deliverables

- Implement candidate scoring/evaluation path in builder agent.
- Add explicit mode switch, e.g. `selectionMode: legacy|competitive` (or equivalent config gate).
- Default mode remains `legacy` for safety.
- Controlled enablement:
  - first enable for one archetype profile (`fortress`) in test scenarios,
  - keep others on legacy until validated.

## Files

- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/placement_rules.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/placement_rules.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/tests/test_builder_agents.py](/Users/jessekauppila/Documents/GitHub/brick_builder/tests/test_builder_agents.py)`

## Test Commands

- `python3 -m unittest tests.test_builder_agents`
- `python3 -c "from backend.simulation.brick_model import run_simulation; s=run_simulation(total_steps=20,cube_cage=100,scad_output_path=None,json_output_path=None,seed=13,verbose=False); print(s['metadata']['placementCount'])"`
- `python3 -c "from backend.simulation.brick_model import run_simulation; s=run_simulation(total_steps=20,cube_cage=100,scad_output_path=None,json_output_path=None,seed=13,verbose=False,builders=[{'id':'fortress-test','archetype':'fortress','shapeId':'bar_2x1','startAnchor':[0,0,0],'placementRuleId':'competitive_growth','maxPlacements':40,'failurePolicy':'backtrack','continuityMode':'strict','maxBacktrackDepth':80}]); print(s['builderStates'][0]['id'])"`

## Done Checks

- Legacy mode output remains stable for existing defaults.
- Competitive mode runs successfully for fortress-only controlled input.
- Candidate-scoring tests verify deterministic ordering/tie-break behavior.

## Rollback Boundary

- Disable mode gate or revert scoring path while retaining Stop 01/02 primitives.
