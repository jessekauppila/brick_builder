# Placement Rule Painter — Shape Editor

## Overview

The Placement Rule Painter is an interactive Three.js editor that lets you visually define where the next brick can be placed relative to the previous one. Instead of hardcoded placement rules, you **paint** the legal positions directly onto a 3D grid.

## Concept

A brick is made of two cubes. Given the most recently placed brick as a reference, the editor answers two questions:

1. **Where can Cube 1 go?** — painted in green around the previous brick
2. **Where can Cube 2 go?** — painted in blue around a reference Cube 1

These painted zones together define both the **shape** of the next brick and the **placement rule** for where it can be placed.

```
 Cube 1 Mode                         Cube 2 Mode
 ─────────────                       ─────────────
 ┌───┐ ┌───┐                         ┌───┐
 │ G │ │ G │ ← green = allowed       │ B │ ← blue = allowed
 └───┘ └───┘   Cube 1 spots          └───┘   Cube 2 offsets
 ┌───┐ ┌───┐ ┌───┐                   ┌───┐ ┌───┐
 │ G │ │▓▓▓│ │▓▓▓│ ← gray =         │ B │ │ G │ ← green =
 └───┘ │ref│ │ref│   previous brick   └───┘ │ref│   reference Cube 1
       └───┘ └───┘                         └───┘
 ┌───┐ ┌───┐                               ┌───┐
 │ G │ │ G │                               │ B │
 └───┘ └───┘                               └───┘
```

## How It Works

### Cube 1 Mode (green)

The previous brick is shown as a solid gray reference. You paint green cells in the surrounding grid to define every legal starting position for the first cube of the next brick.

- **Same plane** — paint cells at the same Z level as the previous brick
- **Above** — paint cells one or more levels up
- **Below** — paint cells one level down
- **Ends vs. middle** — paint only at the ends of the previous brick, or along the middle too
- **All sides** — paint any face-adjacent position you want

The positions you paint are the *complete* set of legal Cube 1 locations. Nothing more, nothing less.

### Cube 2 Mode (blue)

A single reference Cube 1 is shown in green at the center. You paint blue cells around it to define where the second cube of the brick can go, relative to the first.

- If you paint only `(1,0,0)` → every brick is a horizontal bar
- If you paint `(1,0,0)` and `(0,1,0)` → bricks can be bars or L-shapes
- If you paint `(0,0,1)` → bricks can go vertical
- If you paint all 6 adjacent cells → maximum flexibility

### Structural Constraints via Painting

Cantilever behavior is controlled by what you paint, not a separate toggle:

- If all Cube 1 positions are face-adjacent to the previous brick, the first cube always touches the old structure (no floating starts)
- If Cube 2 positions extend away from the previous brick's cells, cantilever is possible
- If Cube 2 positions are constrained to also touch the previous brick, no cantilever can occur

The painted positions ARE the rules.

## Data Model

The editor produces two arrays of 3D offsets:

```typescript
type PlacementRulePaint = {
  cube1Offsets: [number, number, number][];  // relative to previous brick anchor
  cube2Offsets: [number, number, number][];  // relative to Cube 1 position
};
```

### Example: Simple Adjacent Bar

```json
{
  "cube1Offsets": [[2, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]],
  "cube2Offsets": [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]]
}
```

This means: Cube 1 can be placed at any of the 4 horizontal neighbors of the previous brick's ends, and Cube 2 extends one cell in any horizontal direction from Cube 1.

## Shape Priority

When a builder has multiple shapes defined:

- **Unchecked (default):** All shapes are evaluated equally. The builder picks whichever (Cube 1, Cube 2) combination scores highest.
- **Checked:** Shapes are tried in order. The builder uses the first shape that produces a valid placement, only falling back to others if the preferred one can't fit.

## Runtime Behavior

At simulation time, for a builder using a painted rule:

1. Read the previous brick's anchor position
2. For each painted Cube 1 offset → compute candidate world position
3. For each candidate, for each painted Cube 2 offset → compute second cell world position
4. The pair (Cube 1, Cube 2) forms a candidate 2-cell brick
5. Check validity (collision, bounds, buildability)
6. Score all valid candidates and pick the best

## Future Extensions

- **3+ cube shapes** — add Cube 3 mode for T-shapes, L-shapes, etc.
- **Shape templates** — save and load common painted patterns
- **Per-shape weights** — instead of priority ordering, weight shapes numerically
- **Animated preview** — show example placements that the rule would produce
- **Rule sharing** — export/import painted rules as JSON
