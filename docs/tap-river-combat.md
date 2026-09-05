# Wide river, tap combat

Runtime session: 01a0369d-0914-7190-ac0e-b4d37e1fc052.

## Acceptance contract

- Show a bigger, wider river with a farther-out default camera and more physical room to dodge.
- Both players have separate Left, Right, Shoot and Recover buttons, available without changing jobs.
- One press is one action. Holding a pointer or keyboard key must not repeat actions. Repeated deliberate taps produce more steering, shots or repair progress.
- Preserve brief taps and multiple taps between simulation frames across direct WebRTC and relay; duplicate packets/snapshots cannot double an action.
- Replace hitscan beams with big, slow, visible projectiles. Damage happens at impact; large splash explosions can hit groups.
- Add more enemies with readable approach warnings and bounded entity/effect counts.
- Equip shared upgrades automatically; never cover the game with an upgrade menu.
- Keep solo, invitations, host/guest shared health, reconnect/rematch, GPU fallback and versus working.
- Version incompatible co-op rules/controls and explicitly tell stale clients to refresh.

## Implementation

Protocol 7 / co-op ruleset 8. Per-action cumulative counters drain once per simulation tick and survive coalesced or duplicated packets. Legacy held inputs no longer drive co-op. Both players have all four actions. Three scrap plus six persistent shared repair taps restore one heart.

River width increases from 8.5 to 14 world units; the boat traverses normalized x .06–.94. Camera framing is farther out with a 90% default and 65–120% local zoom. Boat scale drops from 1.15 to .9. Enemy pairs arrive every 84 ticks (66 late), after approach warnings.

Each Shoot tap queues a shell with 100-tick maximum flight, speed .009 normalized units/tick, 6 damage and .145 splash radius. A twin upgrade adds a second shell. Queue capacity is six commands; volleys launch at most every ten ticks. Full queues disable Shoot until space returns. Caps: 80 objects, 22 regular predators, 24 shells, 16 explosions. Upgrade milestones auto-equip Twin, Frost, Magnet, Chain and Bubble; no choice overlay.

## Local evidence

- `pnpm check`: lint, all typechecks, 84 tests, builds and Worker dry run passed. Existing large Three.js chunk warning remains informational.
- Real local Durable Object: co-op and versus room smoke passed including auto-start, third-seat rejection and duplicate-seat transfer.
- Browser peers: immediate co-op guest response 26ms with outbound gameplay blocked; direct and relay triplicate burst packets preserve exactly 3 steering + 3 shooting + 6 recovery actions. Reconnect, background/resume, rematch epochs, old-frame rejection, shared hull and guest tap repair pass.
- Actual Chrome touch: hold/release counts once; rapid taps preserved; repair spends exactly three scrap; pinch/reset, automatic upgrade/no popup and five layouts from 320×568 through desktop pass.
- Five worlds with active shells/blasts, DPR capped1.5 and 4× CPU: p95 frame gap16.7–16.8ms, zero >250ms freezes, at most28 draw calls and178772 triangles. GPU context loss and blocked GLB download retain usable fallback.
- Seeded heuristic (three Shoot taps/sec plus steering/repair) wins20/20 without invulnerability in109–110 seconds. Idle simulation never wins across12 seeds. This is not a human difficulty rating.
- WebKit testing found Space-repeat's default click could add a shot on release. Preventing defaults for repeat keydown and focused-button keyup repairs it; regression also covers Enter.
- Chromium and WebKit each pass320×568,390×844,844×390 and1440×900: real tap/mouse actions, six-tap repair, focused Space/Enter repeat, zoom, guide and unobscured controls. Zero browser exceptions.

Evidence: workspace `task-artifacts/tap-river-combat/` (check log, JSON, screenshots). Physical phones/hotspot hardware are not measured. Production release status is recorded separately after exact-SHA CI and public verification; this local evidence is not a deployment claim.
