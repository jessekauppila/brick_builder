---
name: Stop 04 Telemetry Balance
overview: Add additive runtime telemetry and a lightweight balance harness to measure outcomes across seeds before UI expansion.
todos:
  - id: telemetry-trace-fields
    content: Add strategy/score/support additive fields to trace events
    status: pending
  - id: telemetry-timeline
    content: Add per-tick timeline snapshots to simulation payload
    status: pending
  - id: telemetry-balance-harness
    content: Implement matchup-series runner and summary utility
    status: pending
  - id: telemetry-stop4-validation
    content: Run telemetry + harness smoke tests and unit suite
    status: pending
isProject: false
---

# Stop 04: Telemetry + Balance Baseline

## Track

Telemetry

## Deliverables

- Add additive trace event fields:
  - strategy changes,
  - score delta and category breakdown,
  - support/choke markers.
- Add per-tick timeline snapshots to simulation output.
- Add balance harness module to run multi-seed matchups and summarize:
  - win rates,
  - average score gap,
  - per-seed result list.

## Files

- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/balance_harness.py](/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/balance_harness.py)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/tests/test_builder_agents.py](/Users/jessekauppila/Documents/GitHub/brick_builder/tests/test_builder_agents.py)`

## Test Commands

- `python3 -m unittest tests.test_builder_agents`
- `python3 -c "from backend.simulation.brick_model import run_simulation; s=run_simulation(total_steps=8,cube_cage=90,scad_output_path=None,json_output_path=None,seed=5,verbose=False); print(len(s.get('timeline',[])), len(s.get('trace',[])))"`
- `python3 -c "from backend.simulation.brick_model import default_builder_configs; from backend.simulation.balance_harness import run_matchup_series, summarize_matchup_series; r=run_matchup_series(default_builder_configs()[:2],[1,2,3],total_steps=40,cube_cage=120); print(summarize_matchup_series(r))"`

## Done Checks

- Timeline and trace are present and non-empty for non-trivial runs.
- Balance harness runs without SCAD dependency.
- Summary output includes `matchCount`, `winRates`, and `averageScoreGap`.

## Rollback Boundary

- Remove telemetry/harness additions while keeping engine stop work intact.
