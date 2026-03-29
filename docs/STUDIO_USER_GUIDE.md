# Brick Builder Studio — user & developer guide

This document describes the **Brick Builder Studio** UI and Python API after merging the **`yhe` worktree** into `Simple_algorithm_good_UI` (see merge commit message *“Merge wip/yhe-wip…”*). Use it as a **manual for yourself** and for **continued development**.

**Where this file lives:** `docs/STUDIO_USER_GUIDE.md` — a conventional place for project documentation (alongside `README.md` at the repo root).

---

## Quick start

1. **Backend (FastAPI):** run the Python API (typically port **8000**). The UI expects it at `http://127.0.0.1:8000` unless you set **`NEXT_PUBLIC_BRICK_API_URL`** for the Next.js app.
2. **Frontend:** run the Next.js dev server (typically port **3000**).
3. Open the studio page that renders **`BrickBuilderStudio`**.
4. Confirm **`GET /health`** and **`GET /catalog`** succeed; the left rail loads catalog-driven dropdowns when the API is up (otherwise embedded defaults are used).

---

## What each major file does (merged surface)

| Area | File(s) | Role |
|------|---------|------|
| HTTP API | `backend/api.py` | `GET /catalog`, `POST /generate`, `POST /balance`, `GET /exports/{file}`. Maps JSON ↔ simulation payloads (`builder_request_to_sim_payload`). |
| Simulation core | `backend/simulation/brick_model.py` | `BrickModel`, `run_simulation`, `BuilderConfig`, default builders, **timeline** snapshots, exports. |
| Builder brain | `backend/simulation/builder_agent.py` | Placement attempts, **scored candidate evaluation**, strategy shifts, **trace** events, integration with placement rules and world analysis. |
| Grid / spatial analysis | `backend/simulation/world_state.py` | Occupancy, placement analysis (support path, cantilever, neighbors, etc.) used by scoring and validity. |
| Rules | `backend/simulation/placement_rules.py` | Candidate generation for `alternating_sideways_vertical` and **`competitive_growth`**. |
| Competition tuning | `backend/simulation/competition_profiles.py` | Archetypes, symmetry labels, scoring category labels, **`default_objective_weights`** / **`default_buildability_profile`** helpers. |
| Multi-seed harness | `backend/simulation/balance_harness.py` | **`run_matchup_series`**, **`summarize_matchup_series`**; optional **`build_round_robin_pairs`** (library helper only). |
| Shapes / bricks | `backend/simulation/brick_agent.py`, `shapes.py` | Geometry and brick records fed into the scene export. |
| Studio UI | `components/BrickBuilderStudio.tsx` | Full layout: builder forms, generate, balance, preview filter, diagnostics panels. |
| 3D preview | `components/BrickPreviewCanvas.tsx` | Three.js view of brick instances returned by `/generate`. |
| Tests | `tests/test_builder_agents.py`, `tests/test_world_state_spatial.py` | Regression coverage for agents and spatial behavior (**not** exposed in the UI). |

---

## Using the UI (left rail → run → right side)

### Generation settings

- **Total steps**, **seed** (optional), **cage size**, **export file name**, **Save SCAD** checkbox.  
- **Generate model** sends **`POST /generate`** with those fields plus the builder list.

### Builder rule sets (per builder)

- **Identity & motion:** id, color, shape, **placement rule** (`alternating_sideways_vertical` vs **`competitive_growth`**), max placements, failure policy, continuity, backtrack depth, start XYZ.
- **Competition-oriented:** **archetype**, **symmetry**, **selection mode** (see *Gaps* below), **objective weights (JSON)** — keys should match **scoring category** ids from **`GET /catalog`** (`scoringCategories`), or `{}` to lean on archetype defaults from the server.

### Balance matchups

- **Seeds** (comma-separated), **steps per run**, **cage**.  
- **Run balance series** calls **`POST /balance`** with the **same builder payloads** as generate (no SCAD).  
- Results: match count, average score gap, win rates, per-seed table (JSON block).

### Preview workspace

- **Viewer filter:** all builders vs one builder’s bricks.  
- **BrickPreviewCanvas** shows cubes from the latest successful **`/generate`** response.

### Run diagnostics (collapsible)

- **Run summary:** metrics, download links for SCAD/JSON when saved.  
- **Builder configs used / runtime state:** raw JSON mirrors API.  
- **Timeline (recent ticks):** per-tick aggregates when the engine fills `timeline`.  
- **Placement telemetry:** table of recent **`placed`** trace rows (score/support/strategy columns).  
- **Recent trace events** and **raw response** for deep debugging.

---

## API cheat sheet

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/catalog` | Shapes, rules, policies, archetypes, strategy shifts, symmetry modes, scoring categories, default builders. |
| POST | `/generate` | Run simulation; optional SCAD/JSON under `backend/exports/`. |
| POST | `/balance` | Same builders (or server defaults), many seeds; summary JSON only. |
| GET | `/exports/{file_name}` | Download a generated export. |

---

## “Steps” 01–05 — what’s in the product vs what’s missing or non-obvious

The step numbers match the **engineering plan** (spatial engine → selection → telemetry → balance/UI), not a button in the app.

### Step 01–02 — Engine spatial queries (`world_state`, tests)

- **In the product:** Spatial logic runs **inside** placement and scoring. You **do not** get a separate “spatial debugger” or query UI.  
- **How to “use” it:** Indirectly — valid placements, support path, cantilever limits, and competitive scoring all depend on it.  
- **For developers:** See **`tests/test_world_state_spatial.py`**; run with `PYTHONPATH=.` from the repo root.

### Step 03 — Scored candidate selection & competitive growth

- **In the UI:** Archetype, symmetry, objective weights JSON, placement rule **`competitive_growth`**, and **selection mode** dropdown.  
- **Important gap:** **`selectionMode`** is accepted by the API and stored on **`BuilderConfig`**, but the current **`builder_agent`** path **does not branch** on it: candidates are evaluated with scores and a **maximum-score** choice (random tie-break) is used. The **Legacy vs Competitive** labels in the UI are **not** wired to distinct engine algorithms in this tree — treat them as **reserved for future behavior** unless you implement the branch.  
- **Non-obvious:** Changing weights only strongly affects behavior when using **competitive** placement and archetypes that use those categories.

### Step 04 — Telemetry (timeline, trace, placement table)

- **In the UI:** **Timeline**, **Placement telemetry**, **Recent trace events**, and formatted columns that support **both** “Stop 04–style” fields (`previousStrategy`, `selectionMode`, `score` object, `markers`) **and** the **yhe-style** line fields (`scoreDelta`, `scores[]`, `runningScore`, `strategyBefore`/`strategyAfter`, `supportPathExists`).  
- **Gap:** There is no tick scrubber, graph, or export of telemetry alone — only tables + full JSON.  
- **Non-obvious:** If a column shows **—**, the engine simply did not emit that shape of event for that run (not necessarily a bug).

### Step 05 — Balance harness & operational UX

- **In the UI:** **Balance matchups** section and **`POST /balance`**.  
- **Gap:** **`build_round_robin_pairs`** in `balance_harness.py` is **not** called from the API or UI — it’s only for **future** scripted balance workflows.  
- **Non-obvious:** Balance uses the **same** builder JSON as generate but **always** runs **without** writing SCAD; it still spins full simulations per seed.

### Catalog fields with **no** dedicated UI control

The API supports **`allowedStrategyShifts`**, **`initialStrategy`**, and per-field **`buildabilityProfile`** on each builder. **`BrickBuilderStudio`** currently sends **`allowedStrategyShifts: []`**, **`initialStrategy: null`**, and **`buildabilityProfile: {}`** for every builder — so the server merges **archetype defaults** only. There are **no** form fields for:

- Choosing allowed strategy shifts  
- Setting initial strategy explicitly  
- Editing buildability profile (max cantilever, support path flags, etc.)

To tune those today you must **change the client payload** (custom request / future UI work) or rely on archetype defaults from **`competition_profiles`**.

---

## Environment

- **`NEXT_PUBLIC_BRICK_API_URL`** — base URL for the browser’s `fetch` calls (default `http://127.0.0.1:8000`).  
- CORS on the API allows `localhost:3000` and `127.0.0.1:3000`.

---

## Suggested next documentation edits

When you change behavior, update this file **or** add focused pages under `docs/` (e.g. `docs/API.md`) and link them from **`README.md`** so newcomers see the entry point.
