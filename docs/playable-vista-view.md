# Integrated rolling-world vista

Runtime session: 01a0369d-0914-7190-ac0e-b4d37e1fc052.

## Acceptance

- The user clarified: NO separate Vista mode, camera toggle, popup or distracting gallery. The vista is permanently part of the running game.
- Travel forward along an apparently endless cylinder. Steering side to side rolls the curved world beneath the boat, revealing sky and beautiful scenery around its borders.
- Keep a visible sky and atmospheric chapter-specific horizons. Pickups and hazards fall from the sky into the existing action.
- Preserve four tap-only controls, shared hull, objectives, enemy warnings, aiming, zoom, solo and multiplayer. Projection changes must not alter collision rules or authoritative state.
- Keep all controls readable and reachable on phones, landscape and desktop. Scenery should frame the playfield rather than cover it.
- Preserve GPU-loss and failed-download fallback; match drawing and target selection in the curved projection.
- Reuse the original five-world art. No paid services, new image downloads, simulation/protocol changes, or edits to Clearing/RackeTapp.
- Verify curved projection and picking, actual tap input and lateral world roll, shared gameplay, five-world visuals/performance, and the published production bundle.

Status: locally verified. Integrated cylinder, aspect-aware perspective, chapter sky panoramas and sky-drop landings implemented. Shared WebGL/Canvas projection preserves pointer dispatch and gameplay. No camera mode switch.

## Local verification

- Node 22 `pnpm check`: 87 tests, lint, typecheck and all builds passed.
- Shared projection tests match Three.js numerically across four viewports, both steering extremes, all landing lanes and elevated drops; cylinder radius/roll and pre-collision landings verified.
- Chrome and WebKit: 8/8 viewport journeys, actual tap/keyboard input, shared repair, zoom, guide and unobscured controls. No upgrade popup or added mode switch.
- Dedicated rolling-view browser check: steering rolls both ways; sky pickups are above landing markers; real pointer dispatch matches WebGL and genuine context-loss fallback, portrait and landscape.
- Five chapters with active combat at 4× CPU slowdown: p95 16.8 ms, no >250 ms freezes, at most 29 draws / 176808 triangles. All five mobile and desktop captures inspected. Failed asset download and context loss remain playable.
- Real production-room co-op and versus invite journeys with local frontend: shared damage, six guest repair taps and responsive controls passed.
- Evidence: `/Users/guclaw/.openclaw/workspace/task-artifacts/playable-vista-view/`. Physical phones not measured. No game-core, room, transport, or protocol changes; backend stage inapplicable.

## Baseline issue discovered during visual QA

Manual target dispatch from the canvas is correct, but existing `LocalSimulation.stepLocal` supplies a targetId for every player every tick, and `crew.ts` applies each in side order. Thus the neutral Scout/teammate can clear a shared target immediately. The same lines exist in baseline b2354f7. This release preserves that simulation/protocol behavior, including auto aim; it does not claim persistent manual target selection is fixed. A separate combat-input change needs its own multiplayer compatibility verification.
