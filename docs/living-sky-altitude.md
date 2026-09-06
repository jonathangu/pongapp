# Living sky and temporary altitude

Runtime session: `01a0369d-0914-7190-ac0e-b4d37e1fc052`.
Baseline: `26ec4a24c1300ef19c9995bce3ba4aed005bb3c1`.

## Current user correction

The cylinder is too far away. Zoom substantially closer. The sky belongs to the same rolling world, not a static painted background. Things descend from the sky, enemies fly down or float up, and the craft can change altitude through rare special events. Altitude changes are temporary; the default is sea level. Retain automatic aiming. Apply the height system across the game and bosses.

Ambiguous dictated ending: “entire have” is interpreted as “entire game.” Asked whether “earnings for bosses coming” means advance boss warnings, defeat rewards or both. Pending reply, implement advance warnings (the “bosses coming” interpretation), retaining score/salvage rewards rather than adding a currency or progression system.

## Implementation contract

- Bring camera appreciably closer while retaining the previous10° downward tilt, readable boat/enemies and mobile controls. Default view is closer without requiring a zoom button.
- Replace screen-painted clouds/mountains/sun/stars with bounded world-anchored3D atmosphere content at different radial heights. A simple atmospheric color gradient is only the clear color; every visible sky object participates in orbit, depth, perspective and occlusion. Sparse foreground remains.
- Add authoritative radial altitude to craft, objects, projectiles and explosions. Shared3D distance is used by auto-aim, homing, direct/splash collision and pickup collection. Rendering/picking/fallback consume the same height; no cosmetic-only fake lift.
- Rare timed updraft/jetstream sequences raise the craft, hold briefly, then ease back to exactly zero altitude. No fifth control, permanent flying, or altitude management burden. Keep held movement/fire/recovery and stronger taps unchanged.
- Flying/descending enemies and pickups have bounded trajectories that settle at sea level. Readable landing shadows and attack telegraphs make height understandable.
- Add a mid-run sky sentinel alongside the final guardian, with advance warnings, dramatic descending entry and temporary aerial attacks. Only the final guardian satisfies the existing rescue/victory objective. Boss rewards remain ordinary run score/salvage.
- Camera follows altitude gently enough to keep the craft and target readable without turning every lift into another zoom-out. HUD indicates rising/airborne/returning with a small progress indicator.
- Bump co-op ruleset and protocol for the state/physics change; reject old clients with refresh guidance. Preserve versus.
- Verify deterministic trajectories, exact sea-level return/rematch/finish,3D auto-aim and hit separation, boss warning/reward/victory invariants, snapshot caps, camera/sky orbit/picking, eight Chrome/WebKit layouts, direct+relay multiplayer, local and production Durable Objects, fiveworld busy-scene performance/fallback, exact-SHA CI and public asset/browser evidence.

Scope: standalone PongApp only. Preserve preexisting AGENTS.md. No RackeTapp, Clearing, Supabase, new services, generated art, delegated agents or timers.

Status: requirements recorded; implementation next. Evidence directory: `task-artifacts/living-sky-altitude/`.
