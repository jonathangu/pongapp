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

Implementation and verification are in progress; this document is not a release claim.
