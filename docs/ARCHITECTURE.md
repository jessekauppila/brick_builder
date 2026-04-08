# Brick Builder — Architecture & How It Works

## Overview

Brick Builder is a competitive, agent-based brick-placement simulator with a browser-based 3D studio interface. Multiple autonomous **builders** place bricks on a shared 3D grid, each following a configurable **archetype** that governs where they build, how they score placements, and when they shift strategies. The result is an emergent 3D structure that can be previewed live in the browser and exported to OpenSCAD for physical fabrication.

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (http://127.0.0.1:3000)                                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Next.js 16 / React 19 / Tailwind v4                    │   │
│  │  ┌────────────────────┐  ┌────────────────────────────┐  │   │
│  │  │ BrickBuilderStudio │  │  BrickPreviewCanvas        │  │   │
│  │  │ (config + diagnostics) │  (Three.js instanced mesh) │  │   │
│  │  └────────────────────┘  └────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│              │  fetch /catalog, POST /generate, POST /balance   │
└──────────────┼──────────────────────────────────────────────────┘
               ▼
┌─────────────────────────────────────────────────────────────────┐
│  Python API (http://127.0.0.1:8000)                             │
│  FastAPI + uvicorn                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  backend/api.py                                          │   │
│  │  Endpoints: /health, /catalog, /generate, /balance,      │   │
│  │             /exports/{file_name}                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│              │                                                  │
│              ▼                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  backend/simulation/                                     │   │
│  │  brick_model → builder_agent → placement_rules           │   │
│  │                                  world_state              │   │
│  │  competition_profiles, shapes, scad_export                │   │
│  │  balance_harness                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend framework | Next.js (App Router) | 16 |
| UI library | React | 19 |
| Styling | Tailwind CSS | 4 |
| 3D rendering | Three.js via @react-three/fiber + @react-three/drei | 0.183 |
| Backend framework | FastAPI | ≥ 0.116 |
| Backend runtime | Python / uvicorn | 3.x |
| Simulation support | numpy, pandas, mesa (legacy), openpyscad | — |

---

## Repository Layout

```
brick_builder/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout (Geist fonts, global CSS)
│   ├── page.tsx                  # Renders <BrickBuilderStudio />
│   └── globals.css               # Global styles, LED / progress bar animations
├── components/
│   ├── BrickBuilderStudio.tsx    # Main studio UI (forms, state, API calls, diagnostics)
│   ├── BrickPreviewCanvas.tsx    # Three.js 3D preview (instanced mesh rendering)
│   └── hmi/
│       └── StudioPrimitives.tsx  # Reusable UI atoms (panels, tooltips, LEDs, etc.)
├── backend/
│   ├── api.py                    # FastAPI app — all HTTP endpoints
│   ├── requirements.txt          # Python dependencies
│   ├── exports/                  # Generated .scad and .json files
│   └── simulation/
│       ├── __init__.py           # Public re-exports
│       ├── brick_model.py        # Orchestration: BrickModel, run_simulation
│       ├── builder_agent.py      # Builder AI: scoring, strategy shifts, backtracking
│       ├── brick_agent.py        # Per-brick data record (position, color, metadata)
│       ├── world_state.py        # 3D grid: occupancy, collision, spatial analysis
│       ├── placement_rules.py    # Candidate generation rules (competitive_growth, etc.)
│       ├── competition_profiles.py # Archetype definitions, scoring categories, strategies
│       ├── shapes.py             # Brick shapes (1x1, 2x1, 3x1) and orientation math
│       ├── balance_harness.py    # Multi-seed matchup runner for balance testing
│       └── scad_export.py        # OpenSCAD file generation via openpyscad
├── tests/                        # Pytest tests
├── docs/                         # Documentation
├── public/                       # Static assets
├── package.json                  # Node dependencies and scripts
├── next.config.ts                # Next.js configuration
└── tsconfig.json                 # TypeScript configuration
```

---

## Running the Project

```bash
# 1. Install Node dependencies
npm install

# 2. Create Python virtualenv and install deps
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt

# 3. Start both servers
npm run dev          # Next.js on http://127.0.0.1:3000
npm run dev:python   # FastAPI on http://127.0.0.1:8000
```

---

## API Endpoints

All endpoints are defined in `backend/api.py`. There are no Next.js API routes.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/health` | Liveness check — returns `{ "status": "ok" }` |
| `GET` | `/catalog` | Returns all UI options: shapes, placement rules, failure policies, continuity modes, archetypes (with default weights), strategy shifts, symmetry modes, scoring categories, and default builder configs |
| `POST` | `/generate` | Runs the simulation with the given builder configs. Optionally writes `.scad` and `.json` to `backend/exports/`. Returns full simulation payload including bricks, trace events, timeline, and download URLs |
| `POST` | `/balance` | Runs the same simulation across multiple random seeds to compare builder win rates. Returns win rates, average score gaps, and per-seed results |
| `GET` | `/exports/{file_name}` | Downloads a previously generated export file |

CORS is configured to allow `localhost:3000` and `127.0.0.1:3000`.

---

## Simulation Engine

### Entry Point — `brick_model.py`

`run_simulation()` is the top-level function. It:

1. Creates a `BrickModel` with a seeded RNG, a `WorldState` (the 3D grid), and one `BuilderAgent` per builder config.
2. Runs a tick-based loop (up to `total_steps` ticks). Each tick, every active builder gets one `step()` call.
3. Ends early if no builders are active and no placements occurred.
4. Optionally exports to OpenSCAD (`.scad`) and JSON.
5. Returns a dict with metadata, bricks, builder states, trace events, timeline, and the catalog.

**`BuilderConfig`** is a frozen dataclass that holds all per-builder settings: id, color, shape, start anchor, placement rule, failure policy, archetype, objective weights, strategy shifts, buildability profile, symmetry mode, and selection mode.

### 3D Grid — `world_state.py`

`WorldState` manages a set of occupied cells on a discrete 3D grid. Coordinates are multiples of `brick_unit` (default 10). The grid is bounded by `cube_cage` (default 200) in each direction (Z ≥ 0, so no underground).

**`PlacementAnalysis`** is calculated for every candidate placement and contains:

| Metric | Description |
|--------|-------------|
| `valid` | No collisions and all cells within bounds |
| `friendly_neighbors` | Adjacent cells owned by the same builder |
| `enemy_neighbors` | Adjacent cells owned by a different builder |
| `exposed_faces` | Adjacent faces that border empty, in-bounds cells |
| `support_contacts` | Cells directly supported from below |
| `control_cells` | Empty in-bounds neighbor cells (territory the brick "controls") |
| `choke_points` | Positions where the builder is blocking opponents |
| `touches_ground` | Whether any cell is at Z = 0 |
| `support_path_exists` | BFS check that all cells connect to ground through occupied cells |
| `cantilever` | Manhattan distance from the nearest vertically-supported column |
| `unsupported_height` | Vertical gap below the highest unsupported cell |

### Candidate Generation — `placement_rules.py`

When a builder needs to place a brick, candidates are generated based on a **placement rule**:

#### `alternating_sideways_vertical`
Alternates between horizontal moves (4 cardinal directions) on odd steps and vertical moves (up/down) on even steps. Strategy is ignored.

#### `alternating_with_support`
Same alternating pattern as above, **but strategy-aware**. When the builder agent detects a structural problem (cantilever + unsupported height ≥ 2) and shifts to `pillar` strategy, this rule switches from alternating to pillar-down candidates — prioritizing downward moves to build a support column, with horizontal bracing as fallback. When strategy shifts to `reinforce`, it generates vertical brace and horizontal thicken candidates. Once the structure stabilizes and strategy returns to `expand`, normal alternating resumes. This produces a clear, readable pattern: zigzag growth with visible support pillars dropping down wherever the builder got into structural trouble.

#### `competitive_growth` (default)
Generates candidates based on the builder's current **strategy**:

| Strategy | Move types | Behavior |
|----------|-----------|----------|
| **expand** (default) | `extend` (4 horizontal) + `rise` (up/down) | Spread outward, occasionally climb |
| **reinforce** | `brace` (up/down) + `thicken` (4 horizontal) | Build density and structural support |
| **wrap** | `wrap` (4 horizontal) + `climb` (up/down) | Surround enemies, climb over obstacles |
| **pillar** | `pillar_down` + `pillar_up` + `brace` (horizontal) | Build vertical columns with lateral bracing |

Each strategy produces a different set of (anchor, orientation) candidates. All orientations within a group are shuffled randomly.

### Scoring — `builder_agent.py`

Every valid candidate is scored. The **total score** is `sum(raw_metric * weight)` across all scoring categories, plus a strategy bonus.

#### Raw Metrics

| Category | Raw metric formula |
|----------|-------------------|
| **territory** | `control_cells` — empty neighbor count (how much space the brick claims) |
| **surface** | `exposed_faces` — uncovered faces (maximizes surface area for branching structures) |
| **enclosure** | `friendly_neighbors × 1.5 − exposed_faces × 0.35` — rewards compact, enclosed shapes |
| **chain** | Manhattan distance from reference cell ÷ brick_unit + leaf bonus (2.0 if ≤ 2 friendly neighbors) — rewards reaching far from the growth point |
| **support** | `support_contacts × 1.8 + 4.0 (if ground path exists) − cantilever × 2.5 − unsupported_height × 2.0` — rewards structural stability |
| **choke** | `choke_points + enemy_contact_builder_count` — rewards blocking opponents |
| **symmetry** | Reduction in imbalance after placing the brick (based on mirror_x, mirror_y, or radial mode relative to start anchor) |

Each raw metric is multiplied by the corresponding **objective weight** from the archetype. A weight of `1.0` is neutral. Values above 1.0 amplify that behavior; values below 1.0 dampen it. A weight of `0.0` ignores the metric entirely.

#### Strategy Bonus

An additional score component based on current strategy:

| Strategy | Bonus formula |
|----------|--------------|
| **expand** | `control_cells × 0.5 + exposed_faces × 0.2` |
| **reinforce** | `support_contacts × 1.2 + max(0, friendly − enemy neighbors)` |
| **wrap** | `enemy_neighbors × 1.8 + choke_points × 2.0` |
| **pillar** | `support_contacts × 1.5 + 1.5 (if going down or level)` |

### Strategy Shifting

At the start of each step, a builder may automatically shift strategy based on conditions from its *previous* placement:

1. If `enemy_neighbors ≥ wrap_threshold` and `wrap` is allowed → shift to **wrap**
2. Else if `cantilever + unsupported_height ≥ pillar_threshold` and `pillar` is allowed → shift to **pillar**
3. Else if `exposed_faces ≥ reinforce_threshold` and `reinforce` is allowed → shift to **reinforce**
4. Else if `expand` is allowed → fall back to **expand**

Strategy shifts only happen if the target strategy is in the builder's `allowed_strategy_shifts` list.

The thresholds are configurable per builder via the UI sliders:

| Threshold | Default | Controls |
|-----------|---------|----------|
| **Pillar (support risk)** | 2 | `cantilever + unsupported_height` — lower = more cautious, triggers pillar support sooner |
| **Reinforce (exposed faces)** | 8 | `exposed_faces` — lower = thickens structure sooner; higher = stays branchy longer |
| **Wrap (enemy neighbors)** | 2 | `enemy_neighbors` — lower = reacts to nearby opponents faster |

### Buildability Profile

Before scoring, each candidate is filtered by the builder's buildability constraints:

| Constraint | Effect |
|-----------|--------|
| `requireSupportPath` | Reject if no connected path to ground exists |
| `maxCantilever` | Reject if cantilever distance exceeds limit |
| `maxUnsupportedHeight` | Reject if vertical gap below exceeds limit |
| `requireHostContact` | After first placement, reject if no neighbors at all |

### Selection Mode

After scoring all valid candidates:
- **legacy** (default): Pick the highest-scoring candidate; break ties randomly.
- **competitive**: Add a proximity bonus (closer to enemy cells) and a choke bonus, then pick the highest.

### Failure Policies

When no valid candidate exists from the current reference cell:

| Policy | Behavior |
|--------|----------|
| `backtrack` | Search backward through placement history for a reference cell that yields a valid candidate. Uses `max_backtrack_depth` to limit how far back. If nothing found, builder becomes **blocked**. |
| `skip` | Skip this tick, try again next tick from the same reference |
| `stop` | Builder becomes **blocked** immediately |
| `fallback_random` | Place a brick at a random unoccupied position in the grid |

---

## Archetypes

Archetypes are predefined personality profiles that bundle objective weights, strategies, buildability constraints, and symmetry modes. Defined in `competition_profiles.py`.

### Fortress

**Intent:** Build dense, enclosed, symmetrical defensive structures with strong ground support.

| Weight | Value | | Buildability | Value |
|--------|-------|-|-------------|-------|
| territory | 0.6 | | maxCantilever | 1 |
| surface | 0.5 | | maxUnsupportedHeight | 2 |
| enclosure | **2.2** | | requireSupportPath | true |
| chain | 0.3 | | allowPillarDrop | true |
| support | **2.0** | | requireHostContact | false |
| choke | 0.8 | | | |
| symmetry | 0.9 | | | |

- **Initial strategy:** reinforce
- **Allowed shifts:** expand, reinforce, pillar
- **Symmetry:** mirror_x
- High enclosure + support weights produce compact, well-supported walls. Low chain means it stays close to its origin rather than reaching out.

### Vine

**Intent:** Grow long, branching, tendril-like chains that spread rapidly across the grid.

| Weight | Value | | Buildability | Value |
|--------|-------|-|-------------|-------|
| territory | 1.0 | | maxCantilever | 2 |
| surface | 1.1 | | maxUnsupportedHeight | 1 |
| enclosure | 0.2 | | requireSupportPath | true |
| chain | **2.4** | | allowPillarDrop | false |
| support | 0.7 | | requireHostContact | true |
| choke | 1.7 | | | |
| symmetry | 0.1 | | | |

- **Initial strategy:** expand
- **Allowed shifts:** expand, wrap
- **Symmetry:** none
- Highest chain weight drives long, reaching growth. Low enclosure means it doesn't try to close off space. `requireHostContact` forces it to always touch existing structure.

### Coral

**Intent:** Create complex, high-surface-area branching formations resembling organic growth.

| Weight | Value | | Buildability | Value |
|--------|-------|-|-------------|-------|
| territory | 0.9 | | maxCantilever | 2 |
| surface | **2.3** | | maxUnsupportedHeight | 2 |
| enclosure | 0.4 | | requireSupportPath | true |
| chain | 1.7 | | allowPillarDrop | false |
| support | 1.0 | | requireHostContact | false |
| choke | 0.5 | | | |
| symmetry | 0.4 | | | |

- **Initial strategy:** expand
- **Allowed shifts:** expand, reinforce
- **Symmetry:** radial
- Highest surface weight maximizes exposed area (lots of branching). Moderate chain keeps it reaching. Radial symmetry nudges balanced growth in all quadrants.

### Territorial

**Intent:** Aggressively claim as much space as possible, spreading flat and wide.

| Weight | Value | | Buildability | Value |
|--------|-------|-|-------------|-------|
| territory | **2.5** | | maxCantilever | 2 |
| surface | 1.1 | | maxUnsupportedHeight | 2 |
| enclosure | 0.7 | | requireSupportPath | true |
| chain | 0.7 | | allowPillarDrop | true |
| support | 1.1 | | requireHostContact | false |
| choke | 1.0 | | | |
| symmetry | 0.2 | | | |

- **Initial strategy:** expand
- **Allowed shifts:** expand, wrap, pillar
- **Symmetry:** none
- Highest territory weight prioritizes claiming empty neighbor cells. Moderate enclosure and support keep structures reasonably stable. Allows all strategies for maximum adaptability.

---

## Brick Shapes

Defined in `shapes.py`. Each shape is a set of cell offsets from an anchor point.

| Shape ID | Label | Cells | Description |
|----------|-------|-------|-------------|
| `single_1x1` | 1x1 | `(0,0,0)` | Single cube |
| `bar_2x1` | 2x1 Bar | `(0,0,0), (1,0,0)` | Two cubes in a row |
| `bar_3x1` | 3x1 Bar | `(0,0,0), (1,0,0), (2,0,0)` | Three cubes in a row |

Shapes are rotated by orientation (east, west, north, south) using the `orient_cell()` function, which applies 90-degree rotations in the XY plane.

---

## Frontend

### `BrickBuilderStudio.tsx`

The main client component. Responsibilities:

1. **Loads the catalog** on mount via `GET /catalog` to populate dropdowns (archetypes, shapes, placement rules, strategies, symmetry modes, etc.).
2. **Manages builder state** — an array of `BuilderInput` objects, one per builder. Each tracks archetype, shape, color, start position, weights, strategy, shifts, and all other config fields.
3. **Submits generation requests** via `POST /generate`. The response includes brick data, trace events, timeline, builder states, and export paths.
4. **Renders diagnostics** — builder scores, run summaries, placement telemetry, trace events, export paths, and raw JSON response in collapsible sections.
5. **Interactive archetype controls** — strategy dropdown, shift checkboxes, and objective weight sliders that update the builder config in real time.

### `BrickPreviewCanvas.tsx`

A Three.js scene that renders the generated bricks:

- Uses **instanced mesh rendering** for performance (all bricks share one geometry and material).
- Converts backend coordinates (Z-up) to Three.js coordinates (Y-up) via `toThreeJS(bx, by, bz) → (bx, bz, -by)`.
- Supports two display modes: **builder** (each brick colored by its builder) and **support** (green = supported, red = unsupported).
- Includes orbit controls, grid helper, axes helper, and dynamic camera positioning based on scene bounds.

### `StudioPrimitives.tsx`

Reusable UI atoms:

- **StudioPanel** — glass-morphism card container
- **PanelHeader** — styled section header
- **CollapsibleSection** — expandable section with summary badges
- **Metric** — labeled value display
- **JsonBlock** — formatted JSON viewer
- **StatusLight** — LED indicator with optional progress bar animation
- **Tooltip** — hover-activated tooltip using `position: fixed` for viewport-relative positioning (prevents clipping by parent overflow)

---

## Balance Harness

`balance_harness.py` runs the simulation multiple times with different random seeds to compare builder performance:

1. For each seed, runs `run_simulation` with the same builder configs (no file export).
2. Determines the winner by highest total score.
3. Aggregates results into win rates and average score gaps.

Accessed via `POST /balance` from the frontend.

---

## Export Pipeline

When `saveScad` or `saveJson` is enabled on a `/generate` request:

1. **JSON export** — The full simulation dict (metadata, bricks, builders, trace, timeline) is written to `backend/exports/{stem}.json`.
2. **SCAD export** — `scad_export.py` uses `openpyscad` to generate an OpenSCAD file where each brick becomes a translated, colored cube. The `.scad` file can be opened in OpenSCAD for 3D rendering or STL export for 3D printing.

Export files are served via `GET /exports/{file_name}`.

---

## Simulation Lifecycle (End-to-End)

```
User clicks "Generate"
        │
        ▼
BrickBuilderStudio builds payload from BuilderInput[] state
        │
        ▼
POST /generate  →  api.py  →  run_simulation()
        │
        ▼
BrickModel.__init__()
  ├── Creates WorldState (empty 3D grid)
  ├── Normalizes builder configs (merges archetype defaults)
  └── Creates BuilderAgent[] (one per builder)
        │
        ▼
BrickModel.run()  ─── for each tick (0 .. total_steps):
  │
  ├── for each BuilderAgent:
  │     │
  │     ├── _maybe_shift_strategy()     ← check conditions for strategy change
  │     │
  │     ├── _evaluate_reference()       ← generate candidates from current anchor
  │     │     ├── build_candidates()    ← placement_rules.py (strategy-aware)
  │     │     ├── analyze_placement()   ← world_state.py (spatial metrics)
  │     │     ├── _passes_buildability() ← filter by structural constraints
  │     │     └── _score_candidate()    ← apply objective weights + strategy bonus
  │     │
  │     ├── If valid candidate found:
  │     │     └── _commit_placement()   ← occupy cells, record scores, emit trace
  │     │
  │     └── If no valid candidate:
  │           ├── backtrack (search history) -or-
  │           ├── skip / stop / fallback_random
  │           └── If exhausted → builder becomes "blocked"
  │
  └── Build tick snapshot (timeline entry)
        │
        ▼
Optionally write .scad and .json exports
        │
        ▼
Return simulation dict to frontend
        │
        ▼
BrickPreviewCanvas renders bricks in Three.js
Studio displays diagnostics (scores, trace, timeline)
```

---

## Coordinate System

- **Backend:** `(x, y, z)` where **Z is up**. Ground plane is `z = 0`. Coordinates are multiples of `brick_unit` (default 10).
- **Frontend Three.js:** `(x, y, z)` where **Y is up**. Conversion: `Three(x, y, z) = Backend(x, z, -y)`.
- **Grid bounds:** `-cube_cage` to `+cube_cage` on X and Y axes, `0` to `cube_cage` on Z axis.

---

## Key Configuration Fields

| Field | Description |
|-------|-------------|
| **Archetype** | Personality profile that bundles default weights, strategies, buildability constraints, and symmetry |
| **Selection mode** | `legacy` (pick best score) or `competitive` (add enemy proximity + choke bonuses) |
| **Placement rule** | Algorithm for generating candidate positions (`competitive_growth` or `alternating_sideways_vertical`) |
| **Continuity mode** | `strict` — builders must grow contiguously from their previous placement |
| **Failure policy** | What to do when no contiguous placement exists (`backtrack`, `skip`, `stop`, `fallback_random`) |
| **Shape** | Physical shape of each placed brick (1x1, 2x1, 3x1) |
| **Start anchor** | (x, y, z) world coordinate where the builder places its first brick |
| **Max placements** | Builder stops after this many successful placements |
| **Backtrack depth** | How far back in placement history to search when backtracking |
| **Symmetry mode** | `none`, `mirror_x`, `mirror_y`, or `radial` — affects the symmetry scoring metric |
| **Objective weights** | Per-category multipliers that shape the builder's priorities |
| **Initial strategy** | Starting strategy for candidate generation |
| **Allowed strategy shifts** | Which strategies the builder can dynamically switch between |
| **Shift thresholds** | Per-strategy numeric thresholds that control when auto-shifts trigger (pillar: support risk, reinforce: exposed faces, wrap: enemy neighbors) |
