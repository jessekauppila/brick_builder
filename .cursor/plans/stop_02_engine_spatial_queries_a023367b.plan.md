---
name: Stop 02 Engine Spatial Queries
overview: Introduce world-analysis primitives and buildability query helpers without replacing candidate-selection logic yet.
todos:
  - id: engine-world-helpers
    content: Add neighborhood/support/buildability helper methods to WorldState
    status: pending
  - id: engine-world-tests
    content: Add deterministic tests for new world-analysis outputs
    status: pending
  - id: engine-stop2-compat
    content: Verify legacy placement path still behaves as before
    status: pending
isProject: false
---

# Stop 02: Engine Spatial Queries (World Analysis)

## Track

Engine

## Deliverables

- Add read-only spatial analysis helpers in world state:
  - neighborhood ownership checks,
  - support-path existence,
  - grounded support estimation,
  - cantilever and unsupported-height metrics.
- Keep placement acceptance path unchanged unless explicitly invoked.
- Add unit tests that validate helper outputs on controlled mini-worlds.

## Files

- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/world_state.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/world_state.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/tests/test_builder_agents.py](/Users/jessekauppila/Documents/GitHub/brick_builder/tests/test_builder_agents.py)`

## Test Commands

- `python3 -m unittest tests.test_builder_agents`
- `python3 -c "from backend.simulation.world_state import WorldState; print('world_state import ok')"`

## Done Checks

- World helper methods are callable and deterministic for the same seed/setup.
- Existing builder flow still places bricks under legacy rules.
- New tests fail without helpers and pass with helpers.

## Rollback Boundary

- Revert world helper additions and their tests only; candidate logic remains untouched.
