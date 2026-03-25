---
name: Stop 01 Execution Plan
overview: Implement Stop 01 by wiring competitive schema and catalog metadata into the backend contract only, while preserving legacy placement behavior and setting symmetry to neutral defaults.
todos:
  - id: stop01-api-contract
    content: Extend API request models and /generate mapping with additive competitive fields
    status: completed
  - id: stop01-catalog-competitive
    content: Expose archetypes/strategy/symmetry/scoring sections in /catalog
    status: completed
  - id: stop01-model-config
    content: Extend BuilderConfig + normalization + to_dict for new fields with safe defaults
    status: completed
  - id: stop01-symmetry-neutral
    content: Keep symmetry neutral (none) and avoid runtime symmetry logic in this stop
    status: completed
  - id: stop01-compat-verification
    content: Run legacy and expanded payload smoke checks plus unit tests
    status: completed
isProject: false
---

# Stop 01 Implementation: Engine Foundation (Schema + Catalog)

## Objective

Add competitive configuration fields to backend API/model contracts and catalog responses without changing runtime placement behavior.

## Current Baseline (from code)

- `backend/api.py` currently exposes only legacy builder fields in `GenerateRequest.BuilderRequest` and `/catalog`.
- `backend/simulation/brick_model.py` `BuilderConfig` and normalization currently include only legacy fields.
- `backend/simulation/competition_profiles.py` already exists and can supply archetype/scoring metadata.

## Scope Boundaries

- In scope: schema fields, default-merging, catalog expansion.
- Out of scope: scored candidate selection, strategy shifts during runtime, telemetry timeline, UI changes.
- Symmetry policy for Stop 01: keep default behavior neutral (`none` when unset), no symmetry scoring/runtime enforcement yet.

## File-Level Plan

- Update `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/api.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/api.py)`
  - Import from `competition_profiles`: `list_archetypes`, `list_strategy_shifts`, `list_symmetry_modes`, `list_scoring_categories`.
  - Extend `GenerateRequest.BuilderRequest` with optional fields:
    - `archetype: str`
    - `objectiveWeights: dict[str, float]`
    - `allowedStrategyShifts: list[str]`
    - `initialStrategy: Optional[str]`
    - `buildabilityProfile` (nested model)
    - `symmetryMode: str`
  - Add nested `BuildabilityProfileRequest` model.
  - Pass new fields through in `/generate` builder payload mapping.
  - Expand `/catalog` response with archetypes/strategy/symmetry/scoring lists.
- Update `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py)`
  - Extend `BuilderConfig` with additive competitive fields.
  - Include these fields in `to_dict()` output.
  - In `_normalize_builders`, merge defaults safely when fields are omitted:
    - default archetype from existing default builders,
    - `objective_weights` default `{}`,
    - `allowed_strategy_shifts` default `[]`,
    - `initial_strategy` default `""` (or `None` at API layer),
    - `buildability_profile` default `{}`,
    - `symmetry_mode` default `"none"`.
  - Keep legacy `placement_rule_id` default as-is (`alternating_sideways_vertical`) for Stop 01 stability.
- Reuse `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/competition_profiles.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/competition_profiles.py)`
  - Use list functions as catalog providers only in this stop.
  - Do not alter runtime behavior wiring here.

## Deliverables

- API accepts both legacy and expanded competitive builder payloads.
- `/catalog` includes competitive metadata sections.
- `BuilderConfig` can represent expanded fields end-to-end.
- Legacy runs remain behavior-compatible.

## Verification Commands

- `python3 -m unittest tests.test_builder_agents`
- `python3 -c "from backend.simulation.brick_model import run_simulation; s=run_simulation(total_steps=6,cube_cage=80,scad_output_path=None,json_output_path=None,seed=7,verbose=False); print(s['metadata']['brickCount'])"`
- `curl -s http://127.0.0.1:8000/catalog | python3 -m json.tool`
- `curl -s -X POST http://127.0.0.1:8000/generate -H 'Content-Type: application/json' -d '{"totalSteps":4,"cubeCage":80,"saveScad":false,"saveJson":false,"builders":[{"id":"b1","shapeId":"bar_2x1","startAnchor":[0,0,0],"placementRuleId":"alternating_sideways_vertical","maxPlacements":4,"failurePolicy":"backtrack","continuityMode":"strict"}]}' | python3 -m json.tool`
- `curl -s -X POST http://127.0.0.1:8000/generate -H 'Content-Type: application/json' -d '{"totalSteps":4,"cubeCage":80,"saveScad":false,"saveJson":false,"builders":[{"id":"b2","archetype":"fortress","objectiveWeights":{"territory":1.0},"allowedStrategyShifts":["expand"],"initialStrategy":"expand","buildabilityProfile":{"maxCantilever":2,"maxUnsupportedHeight":2,"requireSupportPath":true,"allowPillarDrop":false,"requireHostContact":false},"symmetryMode":"none"}]}' | python3 -m json.tool`

## Done Checks

- Legacy payload: `POST /generate` returns `200` and valid output.
- Expanded payload: `POST /generate` returns `200` and valid output.
- `/catalog` includes: `archetypes`, `strategyShifts`, `symmetryModes`, `scoringCategories`.
- No runtime behavior regression in legacy path (same placement style/default rule behavior).

## Rollback Boundary

- Revert only API/schema/catalog and `BuilderConfig` additive field wiring; no gameplay logic should need rollback in Stop 01.
