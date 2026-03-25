---
name: Stop 05 UI Minimal Adoption
overview: Adopt telemetry in the existing UI incrementally with minimal layout disruption, adding replay and score views as additive sections.
todos:
  - id: ui-additive-replay
    content: Add timeline playback controls without replacing existing page structure
    status: pending
  - id: ui-scoreboard-panel
    content: Render runtime scoreboard from builder states
    status: pending
  - id: ui-event-feed
    content: Render tick event list with strategy and score badges
    status: pending
  - id: ui-overlay-toggle
    content: Add support-risk vs builder-color overlay toggle in preview
    status: pending
  - id: ui-stop5-validation
    content: Run lint/dev and manual regression checklist
    status: pending
isProject: false
---

# Stop 05: UI Minimal Adoption (Replay + Scoreboard)

## Track

UI

## Deliverables

- Preserve current working layout and styling as baseline.
- Add additive UI sections only:
  - timeline scrubber/play-pause,
  - scoreboard panel from runtime state,
  - tick event list with strategy/score badges,
  - optional overlay toggle for support-risk coloring.
- Avoid full-page UI rewrites in this stop.

## Files

- `[/Users/jessekauppila/Documents/GitHub/brick_builder/components/BrickBuilderStudio.tsx](/Users/jessekauppila/Documents/GitHub/brick_builder/components/BrickBuilderStudio.tsx)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/components/BrickPreviewCanvas.tsx](/Users/jessekauppila/Documents/GitHub/brick_builder/components/BrickPreviewCanvas.tsx)`
- `[/Users/jessekauppila/Documents/GitHub/brick_builder/components/hmi/StudioPrimitives.tsx](/Users/jessekauppila/Documents/GitHub/brick_builder/components/hmi/StudioPrimitives.tsx)`

## Test Commands

- `npm run dev`
- `npm run lint`
- Manual checks in browser:
  - Generate run,
  - scrub timeline,
  - toggle overlay,
  - verify scoreboard order updates by score,
  - confirm no hydration or nested-button errors.

## Done Checks

- UI remains visually close to pre-change baseline.
- Replay controls work with timeline payload from Stop 04.
- Score and event panels render without breaking existing generation flow.
- No client hydration warnings from invalid DOM nesting.

## Rollback Boundary

- Remove additive replay panels while preserving core generate workflow UI.
