---
name: builder game roadmap
overview: Create an autoplay-first competitive brick-growth system that prioritizes visually compelling, physically plausible forms while laying the data-model and telemetry groundwork for later human interaction and automated balance testing.
todos:
  - id: config-model
    content: Define builder archetype/config schema for objectives, strategy shifts, buildability, and symmetry.
    status: in_progress
  - id: candidate-scoring
    content: Refactor placement selection from ordered validity checks to scored candidate evaluation.
    status: pending
  - id: world-analysis
    content: Add neighborhood/support/buildability queries to world state.
    status: pending
  - id: archetypes-v1
    content: Implement fortress, vine, coral, and territorial archetypes with shared weighted scoring categories.
    status: pending
  - id: trace-scoring
    content: Extend trace events and simulation payloads to capture strategy shifts, score events, and support/choke outcomes.
    status: pending
  - id: playback-ui
    content: Design autoplay replay UI with tick timeline, scoreboards, strategy badges, and event overlays.
    status: pending
  - id: balance-harness
    content: Plan a post-v1 batch matchup harness for multi-seed balance tuning.
    status: pending
isProject: false
---

# Competitive Builder Roadmap

## Goal

Build a first playable/autoplayable version where visually distinct builders compete in the same 3D world, score points for different objectives, shift strategies during the run, and expose enough telemetry to replay and tune the system.

## Phase 1: Competitive Growth Core

- Extend the builder config model in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py`] and [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/api.py`] so each builder can declare:
  - `archetype` (`fortress`, `vine`, `coral`, `territorial`)
  - objective weights (surface control, enclosure, chain length, support quality, choke)
  - allowed strategy shifts (`expand`, `reinforce`, `wrap`, `pillar`)
  - buildability profile (cantilever budget, support requirements, pillar-drop allowed)
  - optional symmetry mode
- Keep the existing per-builder stepping model in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py`] but split behavior into three layers:
  - identity/archetype
  - current strategy mode
  - physical/buildability constraints
- Replace the current “first valid candidate wins” flow with a candidate scoring pass so multiple legal placements can be ranked before selection.

## Phase 2: Spatial Analysis And Buildability

- Expand [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/world_state.py`] from simple occupancy checks into a neighborhood analysis layer with helpers such as:
  - local neighbor counts
  - exposed faces
  - support path / supported-from-below
  - contested-space proximity
  - host-contact checks for vine/parasite-style growth
- Introduce a buildability evaluator that can reject or penalize placements that are too tall, too unsupported, or too far cantilevered for a builder’s profile.
- Start with a small, legible physical ruleset:
  - support path to ground or to already-supported structure
  - max cantilever distance
  - optional pillar-drop action for eligible builders
- Defer advanced structural simulation until after the first visual/gameplay loop is working.

## Phase 3: Archetypes And Scoring

- Implement four initial archetypes chosen for visual contrast and clear objectives:
  - `fortress`: dense, enclosed, self-supporting growth
  - `vine`: long chains, wrapping, attachment-driven growth
  - `coral`: branching, exposed-surface-heavy growth
  - `territorial`: broad lateral spread and frontier control
- Define a shared scoring model with weighted categories rather than bespoke hard-coded logic per archetype, so tuning stays data-driven.
- Recommended first scoring buckets:
  - territory / controlled frontier
  - exposed surface area
  - enclosure / compactness
  - chain length / branching
  - support quality
  - interaction events such as choke or denied attachment
- Treat “attack” in v1 as positional denial rather than destruction:
  - wrapping/choking an opponent’s frontier
  - blocking attachment opportunities
  - claiming contested expansion space

## Phase 4: Strategy Shifts And Event Telemetry

- Add stateful strategy shifts inside [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py`] so builders can change mode based on local conditions like crowding, support risk, nearby rivals, or scoring opportunities.
- Extend the existing trace/event system in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py`] and the response payload in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py`] to emit structured events for:
  - strategy shift
  - score gained/lost
  - choke/wrap success
  - support penalty or pillar creation
  - symmetry maintained/broken
- Preserve replayability by making each tick deterministic under a seed and by recording enough event metadata to visualize “why” each move happened.

## Phase 5: Playback And Competitive Visualization

- Upgrade the current studio UI in [`/Users/jessekauppila/Documents/GitHub/brick_builder/components/BrickBuilderStudio.tsx`] from static result inspection into timeline playback with:
  - step scrubber / play-pause
  - per-builder score panels
  - current strategy badges
  - recent event feed
  - builder filter and support-risk overlays
- Keep the existing `trace` and `builderStates` surfaces, but reshape them for game readability instead of raw debugging.
- Use the existing Three.js preview integration as the main visual output; add overlays rather than replacing the renderer.

## Phase 6: Balance Harness

- Design the data model from the beginning so builder profiles, scoring weights, and strategy-shift thresholds are configuration-driven rather than buried in conditionals.
- Add a lightweight experiment harness after the first competitive loop works:
  - fixed-seed matchup presets
  - multi-seed batch runs
  - win-rate and score-spread summaries per archetype pairing
- Use this to tune toward rough fairness without sacrificing aesthetics; “visually compelling but slightly asymmetric” is a better target than perfect tournament balance in the first pass.

## Suggested Implementation Order

1. Add archetype/config scaffolding and candidate scoring.
2. Add world-state neighborhood/support analysis.
3. Implement the four archetypes with simple weighted objectives.
4. Add strategy-shift logic and structured score events.
5. Build playback UI with timeline, score, and strategy visualization.
6. Add batch matchup tooling for balance tuning.

## Initial Defaults

- First release mode: autoplay competitive simulator with replay.
- Initial builder set: `fortress`, `vine`, `coral`, `territorial`.
- Initial strategy shifts: `expand`, `reinforce`, `wrap`, `pillar`.
- Initial attack model: denial/choke only, no destructive removal.
- Initial buildability model: support path, cantilever limit, optional pillar-drop.
- Initial balance approach: hand-tune first pass, but structure configs and telemetry so automated round-robin tuning can be added quickly.

## Key Reasoning

The current backend already has the right skeletal architecture for this direction: per-builder configs in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/brick_model.py`], a single-step builder loop in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/builder_agent.py`], occupancy checks in [`/Users/jessekauppila/Documents/GitHub/brick_builder/backend/simulation/world_state.py`], and an existing trace stream plus result UI in [`/Users/jessekauppila/Documents/GitHub/brick_builder/components/BrickBuilderStudio.tsx`]. The plan should build on those seams rather than replace the architecture wholesale.
